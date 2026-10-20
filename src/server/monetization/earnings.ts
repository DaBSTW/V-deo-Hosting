/**
 * Ganancias, saldo y solicitudes de cobro del usuario.
 *
 * Saldo disponible = ganancias ya liberadas (más antiguas que `holdDays`)
 *                    − pagos solicitados, aprobados o pagados.
 * Un pago rechazado deja de restar, así que el importe vuelve al saldo solo.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "../http";
import { flushStats } from "../videos/stats-buffer";
import { getMonetizationSettings, PAYOUT_METHODS, type PayoutMethod } from "./settings";
import { TIER_COUNTRIES, TIER_LABELS, TIERS, type Tier } from "./tiers";

const DAY = 86_400_000;
const utcToday = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

export interface MonetizationOverview {
  platformEnabled: boolean;
  userEnabled: boolean;
  payout: { method: PayoutMethod | null; details: string | null };
  balance: { availableMicros: number; heldMicros: number; monthMicros: number; paidMicros: number; lifetimeMicros: number };
  canRequest: { ok: boolean; reason: string | null; minUsd: number | null };
  daily: { date: string; amountMicros: number; views: number }[];
  byTier: { tier: Tier; label: string; countries: string; views: number; amountMicros: number; rateUsd: number }[];
  topVideos: { id: string; title: string; paidViews: number }[];
  payouts: { id: string; amountMicros: number; method: string; status: string; reference: string | null; note: string | null; createdAt: string; processedAt: string | null }[];
  rules: { minWatchSeconds: number; holdDays: number; perIpDailyCap: number };
  methods: { id: PayoutMethod; label: string; detailsLabel: string; placeholder: string; minUsd: number }[];
}

async function balanceOf(tx: Prisma.TransactionClient, userId: string, holdDays: number) {
  const cutoff = new Date(utcToday().getTime() - holdDays * DAY);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [e] = await tx.$queryRaw<{ released: bigint; held: bigint; month: bigint; total: bigint }[]>`
    SELECT
      COALESCE(SUM(CASE WHEN "day" <= ${cutoff}::date THEN "amountMicros" END), 0) AS released,
      COALESCE(SUM(CASE WHEN "day" >  ${cutoff}::date THEN "amountMicros" END), 0) AS held,
      COALESCE(SUM(CASE WHEN "day" >= ${monthStart}::date THEN "amountMicros" END), 0) AS month,
      COALESCE(SUM("amountMicros"), 0) AS total
    FROM "EarningDaily" WHERE "userId" = ${userId}`;
  const payouts = await tx.payout.groupBy({ by: ["status"], where: { userId }, _sum: { amountMicros: true } });
  const sumOf = (...st: string[]) => payouts.filter((p) => st.includes(p.status)).reduce((s, p) => s + num(p._sum.amountMicros), 0);
  return {
    availableMicros: Math.max(0, num(e.released) - sumOf("PENDING", "APPROVED", "PAID")),
    heldMicros: num(e.held),
    monthMicros: num(e.month),
    paidMicros: sumOf("PAID"),
    lifetimeMicros: num(e.total),
    openPayout: sumOf("PENDING", "APPROVED") > 0,
  };
}

export async function getMonetizationOverview(userId: string): Promise<MonetizationOverview> {
  await flushStats();
  const [settings, user] = await Promise.all([
    getMonetizationSettings(),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { monetizationEnabled: true, payoutMethod: true, payoutDetails: true } }),
  ]);
  const { openPayout, ...balance } = await balanceOf(prisma, userId, settings.holdDays);

  const from = new Date(utcToday().getTime() - 29 * DAY);
  const [rows, top, payouts] = await Promise.all([
    prisma.earningDaily.findMany({ where: { userId, day: { gte: from } } }),
    prisma.$queryRaw<{ publicId: string; title: string; paid: bigint }[]>`
      SELECT v."publicId", v."title", SUM(s."paidViews") AS paid
      FROM "VideoDailyStat" s JOIN "Video" v ON v."id" = s."videoId"
      WHERE v."userId" = ${userId} AND s."day" >= ${from}::date
      GROUP BY v."publicId", v."title" HAVING SUM(s."paidViews") > 0
      ORDER BY paid DESC LIMIT 5`,
    prisma.payout.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  const daily = Array.from({ length: 30 }, (_, i) => ({ date: iso(new Date(from.getTime() + i * DAY)), amountMicros: 0, views: 0 }));
  const idx = new Map(daily.map((d, i) => [d.date, i]));
  const tierAgg = Object.fromEntries(TIERS.map((t) => [t, { views: 0, amountMicros: 0 }])) as Record<Tier, { views: number; amountMicros: number }>;
  for (const r of rows) {
    const d = daily[idx.get(iso(r.day)) ?? -1];
    if (d) {
      d.amountMicros += num(r.amountMicros);
      d.views += r.views;
    }
    const t = tierAgg[r.tier as Tier];
    if (t) {
      t.views += r.views;
      t.amountMicros += num(r.amountMicros);
    }
  }

  const method = (user.payoutMethod as PayoutMethod | null) ?? null;
  const methodCfg = method ? settings.payoutMethods[method] : undefined;
  const minUsd = methodCfg?.minUsd ?? null;
  const reason = !settings.enabled
    ? "La monetización está desactivada en la plataforma."
    : !method || !user.payoutDetails
      ? "Configura tu método de cobro."
      : !methodCfg?.enabled
        ? "Ese método de cobro ya no está disponible; elige otro."
        : openPayout
          ? "Ya tienes un pago en curso."
          : balance.availableMicros < (minUsd ?? 0) * 1e6
            ? `El mínimo para cobrar con ${PAYOUT_METHODS[method].label} es ${minUsd} USD.`
            : null;

  return {
    platformEnabled: settings.enabled,
    userEnabled: user.monetizationEnabled,
    payout: { method, details: user.payoutDetails },
    balance,
    canRequest: { ok: reason === null, reason, minUsd },
    daily,
    byTier: TIERS.map((t) => ({ tier: t, label: TIER_LABELS[t], countries: TIER_COUNTRIES[t], ...tierAgg[t], rateUsd: settings.rates[t] })),
    topVideos: top.map((t) => ({ id: t.publicId, title: t.title, paidViews: num(t.paid) })),
    payouts: payouts.map((p) => ({
      id: p.id,
      amountMicros: num(p.amountMicros),
      method: p.method,
      status: p.status,
      reference: p.reference,
      note: p.note,
      createdAt: p.createdAt.toISOString(),
      processedAt: p.processedAt?.toISOString() ?? null,
    })),
    rules: { minWatchSeconds: settings.minWatchSeconds, holdDays: settings.holdDays, perIpDailyCap: settings.perIpDailyCap },
    methods: (Object.keys(PAYOUT_METHODS) as PayoutMethod[])
      .filter((m) => settings.payoutMethods[m]?.enabled)
      .map((m) => ({ id: m, ...PAYOUT_METHODS[m], minUsd: settings.payoutMethods[m].minUsd })),
  };
}

// ---------------------------------------------------------------------------
const DETAIL_RULES: Record<PayoutMethod, z.ZodType<string>> = {
  PAYPAL: z.string().trim().email("Introduce un email de PayPal válido"),
  PAYONEER: z.string().trim().email("Introduce un email de Payoneer válido"),
  USDT_TRC20: z.string().trim().regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/, "Dirección TRC20 no válida (empieza por T y tiene 34 caracteres)"),
  BANK: z.string().trim().min(15, "Incluye titular, banco, IBAN/CLABE y SWIFT").max(500),
};

export async function updateMonetizationPrefs(
  userId: string,
  patch: { monetizationEnabled?: boolean; payoutMethod?: string; payoutDetails?: string },
) {
  const data: Prisma.UserUpdateInput = {};
  if (patch.monetizationEnabled !== undefined) data.monetizationEnabled = patch.monetizationEnabled;
  if (patch.payoutMethod !== undefined) {
    const settings = await getMonetizationSettings();
    const method = patch.payoutMethod as PayoutMethod;
    if (!(method in PAYOUT_METHODS) || !settings.payoutMethods[method]?.enabled) {
      throw new HttpError(400, "Método de cobro no disponible");
    }
    data.payoutMethod = method;
    data.payoutDetails = DETAIL_RULES[method].parse(patch.payoutDetails ?? "");
  }
  await prisma.user.update({ where: { id: userId }, data });
}

/** Solicita el cobro del saldo disponible completo. */
export async function requestPayout(userId: string) {
  const settings = await getMonetizationSettings();
  await flushStats();
  return prisma.$transaction(
    async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const { availableMicros, openPayout } = await balanceOf(tx, userId, settings.holdDays);
      const method = user.payoutMethod as PayoutMethod | null;
      const cfg = method ? settings.payoutMethods[method] : undefined;
      if (!settings.enabled) throw new HttpError(400, "La monetización está desactivada");
      if (!method || !user.payoutDetails || !cfg?.enabled) throw new HttpError(400, "Configura un método de cobro válido");
      if (openPayout) throw new HttpError(409, "Ya tienes un pago en curso");
      if (availableMicros < cfg.minUsd * 1e6) throw new HttpError(400, `El mínimo para cobrar es ${cfg.minUsd} USD`);
      return tx.payout.create({
        data: { userId, amountMicros: BigInt(availableMicros), method, details: user.payoutDetails },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
