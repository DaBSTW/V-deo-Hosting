/**
 * Ganancias, saldo y solicitudes de cobro del usuario (reparto de ingresos).
 *
 * Saldo disponible = créditos de los meses ya cerrados (RPM real × reparto %)
 *                    − pagos solicitados, aprobados o pagados.
 * El mes en curso solo tiene vistas: su importe se conoce al cerrarlo, y aquí
 * se muestra una estimación con el RPM del último cierre.
 * Un pago rechazado deja de restar, así que el importe vuelve al saldo solo.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "#srv/prisma";
import { HttpError } from "../http";
import { flushStats } from "../videos/stats-buffer";
import { getMonetizationSettings, PAYOUT_METHOD_IDS, type PayoutMethod } from "./settings";
import { currentMonth, lastCreatorRpm, monthRange } from "./settlement";
import { getKycStatus } from "../kyc/service";
import { getPremiumSettings } from "../premium/settings";

const DAY = 86_400_000;
const utcToday = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
/** Los últimos `n` meses ("AAAA-MM"), del más reciente al más antiguo. */
const lastMonths = (n: number) => {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
};

export interface MonetizationOverview {
  platformEnabled: boolean;
  /** Estado de la verificación de identidad (obligatoria para cobrar). */
  kyc: Awaited<ReturnType<typeof getKycStatus>>;
  userEnabled: boolean;
  payout: { method: PayoutMethod | null; details: string | null };
  balance: { availableMicros: number; creditedMicros: number; paidMicros: number };
  /** Mes en curso: vistas y estimación (el importe real se fija al cerrar el mes). */
  current: { month: string; views: number; estimateMicros: number | null; estimateFrom: string | null };
  lastClosed: { month: string; views: number; amountMicros: number } | null;
  /**
   * `reason`: por qué no puede cobrar (código traducible en la interfaz).
   * `needsKyc`: todo lo demás está listo y solo falta verificar la identidad.
   */
  canRequest: { ok: boolean; reason: PayoutBlockReason | null; minUsd: number | null; needsKyc: boolean };
  daily: { date: string; views: number }[];
  /** Últimos 6 meses: vistas y, si el mes está cerrado, lo acreditado. */
  months: { month: string; views: number; amountMicros: number | null; premiumMicros: number; status: "open" | "pending" | "credited" }[];
  /** Vistas completas de suscriptores Premium este mes (cuentan para la bolsa de Premium). */
  premium: { currentViews: number; sharePct: number };
  /** Mes en curso por país, con el RPM para el creador del último cierre (si hay). */
  countries: { country: string; views: number; creatorRpmMicros: number | null }[];
  topVideos: { id: string; title: string; paidViews: number }[];
  payouts: { id: string; amountMicros: number; method: string; status: string; reference: string | null; note: string | null; createdAt: string; processedAt: string | null }[];
  rules: { minWatchSeconds: number; perIpDailyCap: number; sharePct: number };
  methods: { id: PayoutMethod; minUsd: number }[];
}

export type PayoutBlockReason =
  | "platformDisabled"
  | "noMethod"
  | "methodUnavailable"
  | "payoutInProgress"
  | "belowMinimum"
  | "kycPending"
  | "kycRequired";

async function balanceOf(tx: Prisma.TransactionClient, userId: string) {
  const [credited, payouts] = await Promise.all([
    tx.earningCredit.aggregate({ where: { userId }, _sum: { amountMicros: true } }),
    tx.payout.groupBy({ by: ["status"], where: { userId }, _sum: { amountMicros: true } }),
  ]);
  const sumOf = (...st: string[]) => payouts.filter((p) => st.includes(p.status)).reduce((s, p) => s + num(p._sum.amountMicros), 0);
  const creditedMicros = num(credited._sum.amountMicros);
  return {
    availableMicros: Math.max(0, creditedMicros - sumOf("PENDING", "APPROVED", "PAID")),
    creditedMicros,
    paidMicros: sumOf("PAID"),
    openPayout: sumOf("PENDING", "APPROVED") > 0,
  };
}

export async function getMonetizationOverview(userId: string): Promise<MonetizationOverview> {
  await flushStats();
  const [settings, user, kyc] = await Promise.all([
    getMonetizationSettings(),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { monetizationEnabled: true, payoutMethod: true, payoutDetails: true } }),
    getKycStatus(userId),
  ]);
  const { openPayout, ...balance } = await balanceOf(prisma, userId);

  const from = new Date(utcToday().getTime() - 29 * DAY);
  const cur = currentMonth();
  const months = lastMonths(6);
  const [curStart] = monthRange(cur);
  const [sixStart] = monthRange(months[months.length - 1]);
  const [dailyRows, monthViews, credits, closed, curCountries, top, payouts, rpm] = await Promise.all([
    prisma.monetizedViewDaily.groupBy({ by: ["day"], where: { userId, day: { gte: from } }, _sum: { views: true } }),
    prisma.$queryRaw<{ month: string; views: bigint }[]>`
      SELECT to_char("day", 'YYYY-MM') AS month, SUM("views") AS views FROM "MonetizedViewDaily"
      WHERE "userId" = ${userId} AND "day" >= ${sixStart}::date GROUP BY 1`,
    prisma.earningCredit.groupBy({ by: ["month", "source"], where: { userId, month: { in: months } }, _sum: { amountMicros: true, views: true } }),
    prisma.revenueSettlement.findMany({ where: { month: { in: months } }, select: { month: true } }),
    prisma.monetizedViewDaily.groupBy({ by: ["country"], where: { userId, day: { gte: curStart } }, _sum: { views: true }, orderBy: { _sum: { views: "desc" } } }),
    prisma.$queryRaw<{ publicId: string; title: string; paid: bigint }[]>`
      SELECT v."publicId", v."title", SUM(s."paidViews") AS paid
      FROM "VideoDailyStat" s JOIN "Video" v ON v."id" = s."videoId"
      WHERE v."userId" = ${userId} AND s."day" >= ${from}::date
      GROUP BY v."publicId", v."title" HAVING SUM(s."paidViews") > 0
      ORDER BY paid DESC LIMIT 5`,
    prisma.payout.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 25 }),
    lastCreatorRpm(),
  ]);
  const [premiumCur, premiumSettings] = await Promise.all([
    prisma.premiumViewDaily.aggregate({ where: { userId, day: { gte: curStart } }, _sum: { views: true } }),
    getPremiumSettings(),
  ]);

  const daily = Array.from({ length: 30 }, (_, i) => ({ date: iso(new Date(from.getTime() + i * DAY)), views: 0 }));
  const idx = new Map(daily.map((d, i) => [d.date, i]));
  for (const r of dailyRows) {
    const d = daily[idx.get(iso(r.day)) ?? -1];
    if (d) d.views += r._sum.views ?? 0;
  }

  const closedSet = new Set(closed.map((c) => c.month));
  const creditOf = new Map<string, { amount: number; views: number; premium: number }>();
  for (const c of credits) {
    const cur = creditOf.get(c.month) ?? { amount: 0, views: 0, premium: 0 };
    cur.amount += num(c._sum.amountMicros);
    // Las vistas de la tabla son las de anuncios; Premium se muestra aparte.
    if (c.source === "PREMIUM") cur.premium += num(c._sum.amountMicros);
    else cur.views += num(c._sum.views);
    creditOf.set(c.month, cur);
  }
  const viewsOf = new Map(monthViews.map((m) => [m.month, num(m.views)]));
  const monthList = months
    .map((m) => ({
      month: m,
      // En meses cerrados manda lo acreditado (incluye los convertidos del modelo anterior).
      views: Math.max(viewsOf.get(m) ?? 0, creditOf.get(m)?.views ?? 0),
      amountMicros: closedSet.has(m) ? (creditOf.get(m)?.amount ?? 0) : null,
      premiumMicros: creditOf.get(m)?.premium ?? 0,
      status: (closedSet.has(m) ? "credited" : m === cur ? "open" : "pending") as "open" | "pending" | "credited",
    }))
    // Meses pasados sin actividad no aportan nada a la tabla.
    .filter((m) => m.status === "open" || m.views > 0 || (m.amountMicros ?? 0) > 0);

  const countries = curCountries.map((c) => ({ country: c.country, views: c._sum.views ?? 0, creatorRpmMicros: rpm ? rpm.of(c.country) : null }));
  const curViews = countries.reduce((s, c) => s + c.views, 0);
  const estimateMicros = rpm ? Math.floor(countries.reduce((s, c) => s + (c.views * (c.creatorRpmMicros ?? 0)) / 1000, 0)) : null;
  const lastCredited = monthList.find((m) => m.status === "credited" && (m.amountMicros ?? 0) > 0);

  const method = (user.payoutMethod as PayoutMethod | null) ?? null;
  const methodCfg = method ? settings.payoutMethods[method] : undefined;
  const minUsd = methodCfg?.minUsd ?? null;
  const reason: PayoutBlockReason | null = !settings.enabled
    ? "platformDisabled"
    : !method || !user.payoutDetails
      ? "noMethod"
      : !methodCfg?.enabled
        ? "methodUnavailable"
        : openPayout
          ? "payoutInProgress"
          : balance.availableMicros < (minUsd ?? 0) * 1e6
            ? "belowMinimum"
            : kyc.status === "PENDING"
              ? "kycPending"
              : kyc.status !== "APPROVED"
                ? "kycRequired"
                : null;

  return {
    platformEnabled: settings.enabled,
    kyc,
    userEnabled: user.monetizationEnabled,
    payout: { method, details: user.payoutDetails },
    balance,
    current: { month: cur, views: curViews, estimateMicros, estimateFrom: rpm?.month ?? null },
    lastClosed: lastCredited ? { month: lastCredited.month, views: lastCredited.views, amountMicros: lastCredited.amountMicros ?? 0 } : null,
    canRequest: {
      ok: reason === null,
      reason,
      minUsd,
      needsKyc: reason === "kycRequired",
    },
    daily,
    months: monthList,
    countries: countries.slice(0, 12),
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
    premium: { currentViews: num(premiumCur._sum.views), sharePct: premiumSettings.premiumSharePct },
    rules: { minWatchSeconds: settings.minWatchSeconds, perIpDailyCap: settings.perIpDailyCap, sharePct: settings.revenueSharePct },
    methods: PAYOUT_METHOD_IDS.filter((m) => settings.payoutMethods[m]?.enabled).map((m) => ({
      id: m,
      minUsd: settings.payoutMethods[m].minUsd,
    })),
  };
}

// ---------------------------------------------------------------------------
const DETAIL_RULES: Record<PayoutMethod, z.ZodType<string>> = {
  PAYPAL: z.string().trim().email("invalidPaypalEmail"),
  PAYONEER: z.string().trim().email("invalidPayoneerEmail"),
  USDT_TRC20: z.string().trim().regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/, "invalidTrc20"),
  BANK: z.string().trim().min(15, "invalidBankDetails").max(500),
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
    if (!PAYOUT_METHOD_IDS.includes(method) || !settings.payoutMethods[method]?.enabled) {
      throw new HttpError(400, "payoutMethodUnavailable");
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
      const { availableMicros, openPayout } = await balanceOf(tx, userId);
      const method = user.payoutMethod as PayoutMethod | null;
      const cfg = method ? settings.payoutMethods[method] : undefined;
      if (!settings.enabled) throw new HttpError(400, "monetizationDisabled");
      if (!method || !user.payoutDetails || !cfg?.enabled) throw new HttpError(400, "payoutMethodInvalid");
      if (openPayout) throw new HttpError(409, "payoutInProgress");
      if (availableMicros < cfg.minUsd * 1e6) throw new HttpError(400, "belowMinimum", { min: cfg.minUsd });
      // Identidad verificada obligatoria (se pide al solicitar el primer pago).
      if (user.kycStatus !== "APPROVED") {
        throw new HttpError(403, user.kycStatus === "PENDING" ? "kycPending" : "kycRequired");
      }
      return tx.payout.create({
        data: { userId, amountMicros: BigInt(availableMicros), method, details: user.payoutDetails },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
