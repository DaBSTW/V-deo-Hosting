/**
 * Ajustes de monetización (tabla PlatformSetting, clave "monetization").
 * Se editan desde el panel de administración y se cachean 30 s en memoria
 * para no consultar la DB en cada página de reproducción.
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Tier } from "./tiers";

/** Métodos de cobro (sus nombres se traducen en la interfaz). */
export const PAYOUT_METHOD_IDS = ["PAYPAL", "USDT_TRC20", "PAYONEER", "BANK"] as const;
export type PayoutMethod = (typeof PAYOUT_METHOD_IDS)[number];
const methodIds = [...PAYOUT_METHOD_IDS] as [PayoutMethod, ...PayoutMethod[]];

/** Mínimo de retiro de la plataforma: ningún método puede bajar de aquí. */
export const MIN_PAYOUT_USD = 25;

export const monetizationSettingsSchema = z.object({
  /** Interruptor general: anuncios + ganancias. */
  enabled: z.boolean(),
  /** USD que se paga por cada 1 000 vistas monetizadas, por nivel de país. */
  rates: z.object({ T1: z.number().min(0).max(100), T2: z.number().min(0).max(100), T3: z.number().min(0).max(100) }),
  /** Segundos reproducidos para que una vista cuente (o el 50 % si el video es más corto). */
  minWatchSeconds: z.number().int().min(5).max(600),
  /** Días que una ganancia queda retenida antes de poder cobrarse (revisión antifraude). */
  holdDays: z.number().int().min(0).max(90),
  /** Máximo de vistas monetizadas por IP y día (en todos los videos). */
  perIpDailyCap: z.number().int().min(1).max(1000),
  /** Métodos de cobro activos y su mínimo en USD. */
  payoutMethods: z.record(
    z.enum(methodIds),
    z.object({ enabled: z.boolean(), minUsd: z.number().min(MIN_PAYOUT_USD, "minPayoutFloor").max(10_000) }),
  ),
  /** Etiqueta <meta> de verificación del sitio que da Monetag (se inserta en <head>). */
  monetagMetaTag: z.string().max(2_000),
  /** Código de anuncios de Monetag para el reproductor y el enlace directo. */
  monetagPlayerSnippet: z.string().max(20_000),
  /** Contenido del archivo sw.js que pide Monetag (formato Push), servido en /sw.js. */
  monetagServiceWorker: z.string().max(20_000),
});
export type MonetizationSettings = z.infer<typeof monetizationSettingsSchema>;

export const DEFAULT_SETTINGS: MonetizationSettings = {
  enabled: false,
  // Valores de partida conservadores: recalcúlalos con tu eCPM real (ver README).
  rates: { T1: 1.0, T2: 0.4, T3: 0.1 },
  minWatchSeconds: 30,
  holdDays: 7,
  perIpDailyCap: 10,
  payoutMethods: {
    PAYPAL: { enabled: true, minUsd: MIN_PAYOUT_USD },
    USDT_TRC20: { enabled: true, minUsd: MIN_PAYOUT_USD },
    PAYONEER: { enabled: false, minUsd: MIN_PAYOUT_USD },
    BANK: { enabled: false, minUsd: MIN_PAYOUT_USD },
  },
  monetagMetaTag: "",
  monetagPlayerSnippet: "",
  monetagServiceWorker: "",
};

const KEY = "monetization";
const TTL_MS = 30_000;
const g = globalThis as unknown as { __monSettings?: { value: MonetizationSettings; until: number } };

export async function getMonetizationSettings(): Promise<MonetizationSettings> {
  const hit = g.__monSettings;
  if (hit && hit.until > Date.now()) return hit.value;
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } });
  const stored = normalizeMinimums((row?.value ?? {}) as Record<string, unknown>);
  const parsed = monetizationSettingsSchema.partial().safeParse(stored);
  if (!parsed.success) console.warn("[monetization] ajustes guardados inválidos, se usan los predeterminados:", parsed.error.issues);
  const value: MonetizationSettings = {
    ...DEFAULT_SETTINGS,
    ...(parsed.success ? parsed.data : {}),
    payoutMethods: { ...DEFAULT_SETTINGS.payoutMethods, ...(parsed.success ? parsed.data.payoutMethods : {}) },
  };
  g.__monSettings = { value, until: Date.now() + TTL_MS };
  return value;
}

/** Ajustes guardados antes del mínimo de 25 USD: se elevan al nuevo piso. */
function normalizeMinimums(raw: Record<string, unknown>) {
  const methods = raw.payoutMethods as Record<string, { enabled: boolean; minUsd: number }> | undefined;
  if (!methods) return raw;
  return {
    ...raw,
    payoutMethods: Object.fromEntries(
      Object.entries(methods).map(([k, v]) => [k, { ...v, minUsd: Math.max(MIN_PAYOUT_USD, Number(v?.minUsd) || 0) }]),
    ),
  };
}

export async function saveMonetizationSettings(value: MonetizationSettings): Promise<MonetizationSettings> {
  const clean = monetizationSettingsSchema.parse(value);
  await prisma.platformSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: clean },
    update: { value: clean },
  });
  g.__monSettings = { value: clean, until: Date.now() + TTL_MS };
  return clean;
}

/** Tarifa en micro-dólares por UNA vista (rates están en USD por 1 000 vistas). */
export const microsPerView = (s: MonetizationSettings, tier: Tier) => Math.round(s.rates[tier] * 1000);

/** Extrae name/content de la etiqueta <meta> pegada por el admin. */
export function parseMetaTag(tag: string): { name: string; content: string } | null {
  const name = /name\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
  const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
  return name && content ? { name, content } : null;
}
