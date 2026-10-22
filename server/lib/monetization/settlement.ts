/**
 * Reparto de ingresos (revenue share) con cierre mensual.
 *
 * Durante el mes solo se cuentan vistas monetizadas por país (sin importe).
 * Al terminar, el administrador copia del panel de Monetag el RPM real de cada
 * país (USD por 1.000 vistas) y cierra el mes:
 *
 *   crédito del creador = vistas del país / 1.000 × RPM real del país × reparto %
 *
 * Ejemplo: México con RPM real 1,50 $ y reparto del 30 % → 0,45 $ por cada
 * 1.000 vistas monetizadas de México. Si a Monetag le va bien ese mes, al
 * creador también; si el mercado baja, la plataforma no asume la diferencia.
 *
 * Tope opcional: el RPM de Monetag se mide sobre SUS impresiones, que nunca
 * coinciden exactamente con nuestras vistas monetizadas. Si se indica lo que
 * Monetag pagó en total ese mes, el reparto nunca supera `reparto % × ingresos`
 * (si lo superara, todos los créditos se escalan en proporción).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "#srv/prisma";
import { HttpError } from "../http";
import { flushStats } from "../videos/stats-buffer";
import { getMonetizationSettings } from "./settings";

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const COUNTRY_RE = /^[A-Z]{2}$/;
const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
const toMicros = (usd: number) => Math.round(usd * 1e6);

export const monthOf = (d: Date) => d.toISOString().slice(0, 7);
export const currentMonth = () => monthOf(new Date());
/** [inicio, fin) del mes en UTC. */
export function monthRange(month: string): [Date, Date] {
  const [y, m] = month.split("-").map(Number);
  return [new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 1))];
}

export interface SettlementInput {
  /** RPM real por país en USD por 1.000 vistas, p. ej. { MX: 1.5, US: 4.2 }. */
  rpm: Record<string, number>;
  /** RPM para los países que no estén en `rpm`. */
  defaultRpm: number;
  /** Ingresos totales del mes en Monetag (USD). Opcional: activa el tope. */
  revenue?: number | null;
}

export interface SettlementPreview {
  month: string;
  sharePct: number;
  rows: { country: string; views: number; users: number; rpmMicros: number; creditedMicros: number }[];
  views: number;
  /** Ingreso estimado con los RPM indicados (vistas × RPM). */
  grossMicros: number;
  /** Total para los creadores tras el tope. */
  creditedMicros: number;
  /** Tope del reparto (reparto % × ingresos), si se indicaron los ingresos. */
  capMicros: number | null;
  /** Factor aplicado por el tope (1 = sin recorte). */
  scale: number;
  creators: number;
}

/** Vistas monetizadas del mes agrupadas por país (y nº de creadores). */
export async function monthCountries(month: string) {
  const [from, to] = monthRange(month);
  const rows = await prisma.$queryRaw<{ country: string; views: bigint; users: bigint }[]>`
    SELECT "country", SUM("views") AS views, COUNT(DISTINCT "userId") AS users
    FROM "MonetizedViewDaily" WHERE "day" >= ${from}::date AND "day" < ${to}::date
    GROUP BY "country" ORDER BY views DESC`;
  return rows.map((r) => ({ country: r.country, views: num(r.views), users: num(r.users) }));
}

function assertMonth(month: string) {
  if (!MONTH_RE.test(month)) throw new HttpError(400, "invalidData");
}

/** Calcula el reparto de un mes (sin guardar nada). */
async function compute(month: string, input: SettlementInput, sharePct: number) {
  const [from, to] = monthRange(month);
  const perUser = await prisma.$queryRaw<{ userId: string; country: string; views: bigint }[]>`
    SELECT "userId", "country", SUM("views") AS views
    FROM "MonetizedViewDaily" WHERE "day" >= ${from}::date AND "day" < ${to}::date
    GROUP BY "userId", "country"`;

  const rpmMicrosOf = (c: string) => toMicros(input.rpm[c] ?? input.defaultRpm);
  // Antes del tope: vistas / 1.000 × RPM × reparto (en micro-USD, sin decimales).
  const raw = perUser.map((r) => {
    const views = num(r.views);
    const rpmMicros = rpmMicrosOf(r.country);
    return { userId: r.userId, country: r.country, views, rpmMicros, amount: Math.floor((views * rpmMicros * sharePct) / 100_000) };
  });
  const rawTotal = raw.reduce((s, r) => s + r.amount, 0);
  const capMicros = input.revenue != null ? Math.floor((toMicros(input.revenue) * sharePct) / 100) : null;
  const scale = capMicros != null && rawTotal > capMicros && rawTotal > 0 ? capMicros / rawTotal : 1;
  const credits = raw.map((r) => ({ ...r, amount: Math.floor(r.amount * scale) }));

  const byCountry = new Map<string, SettlementPreview["rows"][number]>();
  for (const c of credits) {
    const row = byCountry.get(c.country) ?? { country: c.country, views: 0, users: 0, rpmMicros: c.rpmMicros, creditedMicros: 0 };
    row.views += c.views;
    row.users += 1;
    row.creditedMicros += c.amount;
    byCountry.set(c.country, row);
  }
  const rows = [...byCountry.values()].sort((a, b) => b.views - a.views);
  const preview: SettlementPreview = {
    month,
    sharePct,
    rows,
    views: rows.reduce((s, r) => s + r.views, 0),
    grossMicros: Math.floor(rows.reduce((s, r) => s + (r.views * r.rpmMicros) / 1000, 0)),
    creditedMicros: credits.reduce((s, c) => s + c.amount, 0),
    capMicros,
    scale,
    creators: new Set(credits.map((c) => c.userId)).size,
  };
  return { preview, credits };
}

/** Resumen para el panel: meses cerrados, meses pendientes de cerrar y el mes en curso. */
export async function listSettlements() {
  await flushStats();
  const [closed, months] = await Promise.all([
    prisma.revenueSettlement.findMany({ orderBy: { month: "desc" }, take: 24 }),
    prisma.$queryRaw<{ month: string; views: bigint }[]>`
      SELECT to_char("day", 'YYYY-MM') AS month, SUM("views") AS views
      FROM "MonetizedViewDaily" GROUP BY 1 ORDER BY 1 DESC LIMIT 24`,
  ]);
  const closedSet = new Set(closed.map((c) => c.month));
  const cur = currentMonth();
  return {
    current: { month: cur, views: num(months.find((m) => m.month === cur)?.views) },
    /** Meses ya terminados con vistas y sin cerrar (el más antiguo primero). */
    pending: months
      .filter((m) => m.month < cur && !closedSet.has(m.month))
      .map((m) => ({ month: m.month, views: num(m.views) }))
      .reverse(),
    closed: closed.map((c) => ({
      month: c.month,
      sharePct: c.sharePct,
      views: c.views,
      creditedMicros: num(c.creditedMicros),
      revenueMicros: c.revenueMicros == null ? null : num(c.revenueMicros),
      scale: c.scale,
      legacy: c.legacy,
      closedAt: c.closedAt.toISOString(),
      closedBy: c.closedBy,
    })),
  };
}

/** Detalle de un mes: vistas por país y, si ya está cerrado, el cierre guardado. */
export async function getSettlementMonth(month: string) {
  assertMonth(month);
  await flushStats();
  const [countries, closed, settings] = await Promise.all([
    monthCountries(month),
    prisma.revenueSettlement.findUnique({ where: { month } }),
    getMonetizationSettings(),
  ]);
  return {
    month,
    sharePct: closed?.sharePct ?? settings.revenueSharePct,
    countries,
    closed: closed
      ? {
          rpmByCountry: closed.rpmByCountry as Record<string, number>,
          defaultRpmMicros: num(closed.defaultRpmMicros),
          revenueMicros: closed.revenueMicros == null ? null : num(closed.revenueMicros),
          creditedMicros: num(closed.creditedMicros),
          scale: closed.scale,
          legacy: closed.legacy,
          closedAt: closed.closedAt.toISOString(),
        }
      : null,
  };
}

export async function previewSettlement(month: string, input: SettlementInput) {
  assertMonth(month);
  const settings = await getMonetizationSettings();
  return (await compute(month, input, settings.revenueSharePct)).preview;
}

/**
 * Cierra el mes y acredita a cada creador su parte (por país). Solo meses ya
 * terminados y una única vez: el crédito pasa al saldo disponible al instante.
 */
export async function closeSettlement(month: string, input: SettlementInput, adminEmail: string) {
  assertMonth(month);
  if (month >= currentMonth()) throw new HttpError(400, "monthNotFinished");
  await flushStats();
  const settings = await getMonetizationSettings();
  const { preview, credits } = await compute(month, input, settings.revenueSharePct);
  try {
    await prisma.$transaction([
      prisma.revenueSettlement.create({
        data: {
          month,
          sharePct: preview.sharePct,
          rpmByCountry: Object.fromEntries(Object.entries(input.rpm).map(([c, usd]) => [c, toMicros(usd)])),
          defaultRpmMicros: BigInt(toMicros(input.defaultRpm)),
          revenueMicros: input.revenue != null ? BigInt(toMicros(input.revenue)) : null,
          scale: preview.scale,
          views: preview.views,
          creditedMicros: BigInt(preview.creditedMicros),
          closedBy: adminEmail,
        },
      }),
      prisma.earningCredit.createMany({
        data: credits
          .filter((c) => c.amount > 0)
          .map((c) => ({ userId: c.userId, month, country: c.country, views: c.views, rpmMicros: BigInt(c.rpmMicros), amountMicros: BigInt(c.amount) })),
      }),
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new HttpError(409, "monthAlreadyClosed");
    throw err;
  }
  return preview;
}

/**
 * RPM del creador por país según el último cierre real (no los convertidos del
 * modelo anterior), para estimar el mes en curso. `null` si aún no hay cierres.
 */
export async function lastCreatorRpm() {
  const last = await prisma.revenueSettlement.findFirst({ where: { legacy: false }, orderBy: { month: "desc" } });
  if (!last) return null;
  const map = last.rpmByCountry as Record<string, number>;
  const factor = (last.sharePct / 100) * last.scale;
  return {
    month: last.month,
    /** micro-USD por 1.000 vistas para el creador. */
    of: (country: string) => Math.floor((map[country] ?? num(last.defaultRpmMicros)) * factor),
  };
}
