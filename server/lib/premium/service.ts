/**
 * Suscripción Premium con PayPal.
 *
 * Flujo:
 *  1. `startCheckout` crea la suscripción en PayPal (custom_id = usuario) y
 *     devuelve el enlace de aprobación; el usuario paga en PayPal.
 *  2. Al volver (página /premium/return), con cada webhook y en la renovación,
 *     `syncSubscription` LEE de PayPal el estado y los cobros y los guarda.
 *  3. `premiumUntil` del usuario se recalcula a partir de los cobros:
 *     fin del periodo pagado más 1 día de margen. Si la suscripción sigue
 *     activa, también cubre hasta el próximo cobro.
 *
 * Toda la verdad sale de la API de PayPal: un webhook falso o un parámetro
 * manipulado en la URL de retorno como mucho provocan una sincronización.
 */
import { prisma } from "#srv/prisma";
import { APP_NAME } from "#shared/lib/brand";
import { getCoreEnv, isGatewayConfigured, isPaypalConfigured } from "#srv/env";
import { HttpError } from "../http";
import { monthRange } from "../monetization/settlement";
import * as paypal from "./paypal";
import { PLAN_MONTHS, getPremiumSettings, savePremiumSettings, type PremiumPlan } from "./settings";

const GRACE_MS = 24 * 3600 * 1000;
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
const usdToMicros = (v: string | undefined) => Math.round(Number(v ?? 0) * 1e6);

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

export const isPremium = (until: Date | null | undefined) => !!until && until.getTime() > Date.now();

function assertReady() {
  if (!isPaypalConfigured()) throw new HttpError(503, "paypalNotConfigured");
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------
export async function startCheckout(userId: string, plan: PremiumPlan) {
  assertReady();
  const settings = await getPremiumSettings();
  if (!settings.enabled) throw new HttpError(403, "premiumDisabled");
  const planId = settings.plans[plan].planId;
  if (!planId) throw new HttpError(409, "planUnavailable");
  const active = await prisma.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "SUSPENDED"] } } });
  if (active) throw new HttpError(409, "alreadySubscribed");

  const app = getCoreEnv().APP_URL;
  const { id, approveUrl } = await paypal.createSubscription({
    planId,
    userId,
    brandName: APP_NAME,
    returnUrl: `${app}/premium/return`,
    cancelUrl: `${app}/premium?cancelled=1`,
    requestId: `sub-${userId}-${plan}-${Math.floor(Date.now() / 60_000)}`,
  });
  await prisma.subscription.upsert({
    where: { providerSubscriptionId: id },
    create: { userId, providerSubscriptionId: id, plan, status: "APPROVAL_PENDING" },
    update: {},
  });
  return { approveUrl };
}

// ---------------------------------------------------------------------------
// Sincronización (fuente de verdad: PayPal)
// ---------------------------------------------------------------------------
const inFlight = new Map<string, Promise<unknown>>();

/** Lee de PayPal la suscripción y sus cobros, los guarda y recalcula el Premium del usuario. */
export function syncSubscription(providerSubscriptionId: string) {
  // Varias llamadas a la vez (retorno + webhooks) comparten la misma sincronización.
  const running = inFlight.get(providerSubscriptionId);
  if (running) return running as ReturnType<typeof doSync>;
  const p = doSync(providerSubscriptionId).finally(() => inFlight.delete(providerSubscriptionId));
  inFlight.set(providerSubscriptionId, p);
  return p;
}

async function doSync(providerSubscriptionId: string) {
  assertReady();
  const row = await prisma.subscription.findUnique({ where: { providerSubscriptionId } });
  if (!row) throw new HttpError(404, "subscriptionNotFound");
  const remote = await paypal.getSubscription(providerSubscriptionId);
  // Defensa extra: la suscripción debe ser la que creamos para este usuario.
  if (remote.custom_id && remote.custom_id !== row.userId) throw new HttpError(403, "subscriptionNotFound");

  const months = PLAN_MONTHS[row.plan as PremiumPlan] ?? 1;
  const txs =
    remote.status === "APPROVAL_PENDING"
      ? []
      : await paypal.listTransactions(providerSubscriptionId, new Date(row.createdAt.getTime() - GRACE_MS), new Date());
  for (const tx of txs) {
    if (tx.status !== "COMPLETED" && tx.status !== "REFUNDED" && tx.status !== "PARTIALLY_REFUNDED") continue;
    const { gross_amount, fee_amount, net_amount } = tx.amount_with_breakdown;
    const gross = usdToMicros(gross_amount.value);
    const fee = usdToMicros(fee_amount?.value);
    const net = net_amount ? usdToMicros(net_amount.value) : gross - fee;
    const refunded = tx.status !== "COMPLETED";
    await prisma.subscriptionPayment.upsert({
      where: { providerTransactionId: tx.id },
      create: {
        subscriptionId: row.id,
        userId: row.userId,
        providerTransactionId: tx.id,
        grossMicros: BigInt(gross),
        feeMicros: BigInt(fee),
        netMicros: BigInt(net),
        currency: gross_amount.currency_code.slice(0, 3),
        periodMonths: months,
        paidAt: new Date(tx.time),
        refunded,
      },
      update: { refunded },
    });
  }

  const next = remote.billing_info?.next_billing_time ? new Date(remote.billing_info.next_billing_time) : null;
  const updated = await prisma.subscription.update({
    where: { id: row.id },
    data: {
      status: remote.status,
      nextBillingAt: remote.status === "ACTIVE" ? next : null,
      cancelledAt: remote.status === "CANCELLED" && !row.cancelledAt ? new Date() : row.cancelledAt,
    },
  });
  const premiumUntil = await recomputePremium(row.userId);
  return { subscription: updated, premiumUntil };
}

/** Recalcula `User.premiumUntil` a partir de los cobros y las suscripciones activas. */
export async function recomputePremium(userId: string): Promise<Date | null> {
  const [payments, active] = await Promise.all([
    prisma.subscriptionPayment.findMany({ where: { userId, refunded: false }, select: { paidAt: true, periodMonths: true } }),
    prisma.subscription.findMany({ where: { userId, status: "ACTIVE", nextBillingAt: { not: null } }, select: { nextBillingAt: true } }),
  ]);
  let until = 0;
  for (const p of payments) until = Math.max(until, addMonths(p.paidAt, p.periodMonths).getTime());
  // Activa y con algún cobro: cubre hasta el próximo cobro (PayPal la suspende si falla).
  if (payments.length) for (const s of active) until = Math.max(until, s.nextBillingAt!.getTime());
  const premiumUntil = until ? new Date(until + GRACE_MS) : null;
  await prisma.user.update({ where: { id: userId }, data: { premiumUntil } });
  return premiumUntil;
}

/** Sincroniza todas las suscripciones vivas (script diario opcional / botón del admin). */
export async function syncAllSubscriptions() {
  const subs = await prisma.subscription.findMany({
    where: { OR: [{ status: { in: ["ACTIVE", "SUSPENDED", "APPROVED"] } }, { status: "APPROVAL_PENDING", createdAt: { gt: new Date(Date.now() - 3 * GRACE_MS) } }] },
    select: { providerSubscriptionId: true },
  });
  let ok = 0;
  for (const s of subs) {
    try {
      await syncSubscription(s.providerSubscriptionId);
      ok++;
    } catch (err) {
      console.error("[premium] sincronización falló:", s.providerSubscriptionId, err);
    }
  }
  return { total: subs.length, ok };
}

const lastResync = new Map<string, number>();

/**
 * Si el periodo pagado vence en menos de un día (o venció hace poco) y el
 * usuario tiene una suscripción activa, se comprueba en PayPal en segundo plano
 * por si se perdió el webhook de la renovación. Como mucho una vez por hora.
 */
export function maybeResyncUser(userId: string, premiumUntil: Date | null) {
  if (!premiumUntil || !isPaypalConfigured()) return;
  const left = premiumUntil.getTime() - Date.now();
  if (left > GRACE_MS || left < -7 * GRACE_MS) return;
  if ((lastResync.get(userId) ?? 0) > Date.now()) return;
  lastResync.set(userId, Date.now() + 3600_000);
  void (async () => {
    const subs = await prisma.subscription.findMany({ where: { userId, status: { in: ["ACTIVE", "SUSPENDED"] } }, select: { providerSubscriptionId: true } });
    for (const s of subs) await syncSubscription(s.providerSubscriptionId).catch((err) => console.error("[premium] resync:", err));
  })();
}

// ---------------------------------------------------------------------------
// Baja
// ---------------------------------------------------------------------------
export async function cancelUserSubscription(userId: string) {
  assertReady();
  const sub = await prisma.subscription.findFirst({ where: { userId, status: { in: ["ACTIVE", "SUSPENDED"] } }, orderBy: { createdAt: "desc" } });
  if (!sub) throw new HttpError(404, "subscriptionNotFound");
  await paypal.cancelSubscription(sub.providerSubscriptionId, "Cancelada por el usuario");
  return syncSubscription(sub.providerSubscriptionId);
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
export async function getUserPremium(userId: string) {
  const [user, subs, payments] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } }),
    prisma.subscription.findMany({ where: { userId, status: { not: "APPROVAL_PENDING" } }, orderBy: { createdAt: "desc" }, take: 1 }),
    prisma.subscriptionPayment.findMany({ where: { userId }, orderBy: { paidAt: "desc" }, take: 24 }),
  ]);
  const sub = subs[0];
  return {
    premium: isPremium(user?.premiumUntil),
    premiumUntil: user?.premiumUntil?.toISOString() ?? null,
    subscription: sub
      ? { plan: sub.plan as PremiumPlan, status: sub.status, nextBillingAt: sub.nextBillingAt?.toISOString() ?? null, createdAt: sub.createdAt.toISOString(), cancelledAt: sub.cancelledAt?.toISOString() ?? null }
      : null,
    payments: payments.map((p) => ({
      id: p.providerTransactionId,
      grossMicros: num(p.grossMicros),
      currency: p.currency,
      periodMonths: p.periodMonths,
      paidAt: p.paidAt.toISOString(),
      refunded: p.refunded,
    })),
  };
}
export type UserPremium = Awaited<ReturnType<typeof getUserPremium>>;

/**
 * Ingresos NETOS de Premium imputables a un mes: cada cobro se reparte a
 * partes iguales entre los meses que cubre (el anual, 1/12 por mes).
 */
export async function amortizedPremiumRevenue(month: string): Promise<number> {
  const [from, to] = monthRange(month);
  const payments = await prisma.subscriptionPayment.findMany({
    where: { refunded: false, paidAt: { lt: to, gte: addMonths(from, -12) } },
    select: { paidAt: true, periodMonths: true, netMicros: true },
  });
  let total = 0;
  for (const p of payments) {
    const start = Date.UTC(p.paidAt.getUTCFullYear(), p.paidAt.getUTCMonth(), 1);
    const end = addMonths(new Date(start), p.periodMonths).getTime();
    if (from.getTime() >= start && from.getTime() < end) total += num(p.netMicros) / p.periodMonths;
  }
  return Math.floor(total);
}

// ---------------------------------------------------------------------------
// Administración
// ---------------------------------------------------------------------------
/** Crea en PayPal el producto y los planes que falten (o cuyo precio cambió). */
export async function syncPlans() {
  assertReady();
  const s = await getPremiumSettings();
  const next = structuredClone(s);
  if (!next.paypalProductId) next.paypalProductId = (await paypal.createProduct(APP_NAME, getCoreEnv().APP_URL)).id;
  for (const plan of ["MONTHLY", "YEARLY"] as const) {
    const cfg = next.plans[plan];
    if (cfg.planId && cfg.planPriceUsd === cfg.priceUsd) continue;
    // Un cambio de precio crea un plan nuevo: los suscriptores actuales siguen con el anterior.
    const { id } = await paypal.createPlan(next.paypalProductId, `${APP_NAME} Premium ${plan === "MONTHLY" ? "mensual" : "anual"}`, plan === "MONTHLY" ? "MONTH" : "YEAR", cfg.priceUsd);
    next.plans[plan] = { ...cfg, planId: id, planPriceUsd: cfg.priceUsd };
  }
  return savePremiumSettings(next);
}

export async function getPremiumAdminSummary() {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const [from, to] = monthRange(month);
  const [subscribers, byPlan, monthGross, recent] = await Promise.all([
    prisma.user.count({ where: { premiumUntil: { gt: now } } }),
    prisma.subscription.groupBy({ by: ["plan"], where: { status: "ACTIVE" }, _count: true }),
    prisma.subscriptionPayment.aggregate({ where: { refunded: false, paidAt: { gte: from, lt: to } }, _sum: { grossMicros: true, netMicros: true } }),
    prisma.subscription.findMany({
      where: { status: { not: "APPROVAL_PENDING" } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { user: { select: { email: true, premiumUntil: true } } },
    }),
  ]);
  const settings = await getPremiumSettings();
  const active = Object.fromEntries(byPlan.map((p) => [p.plan, p._count])) as Partial<Record<PremiumPlan, number>>;
  // Ingreso recurrente mensual estimado (bruto), con el anual prorrateado.
  const mrr = (active.MONTHLY ?? 0) * settings.plans.MONTHLY.priceUsd + ((active.YEARLY ?? 0) * settings.plans.YEARLY.priceUsd) / 12;
  return {
    configured: isPaypalConfigured(),
    gatewayConfigured: isGatewayConfigured(),
    subscribers,
    activeMonthly: active.MONTHLY ?? 0,
    activeYearly: active.YEARLY ?? 0,
    mrrMicros: Math.round(mrr * 1e6),
    monthGrossMicros: num(monthGross._sum.grossMicros),
    monthNetMicros: num(monthGross._sum.netMicros),
    monthAmortizedMicros: await amortizedPremiumRevenue(month),
    recent: recent.map((s) => ({
      email: s.user.email,
      plan: s.plan,
      status: s.status,
      providerSubscriptionId: s.providerSubscriptionId,
      premiumUntil: s.user.premiumUntil?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}
