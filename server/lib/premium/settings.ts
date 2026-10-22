/**
 * Ajustes de la suscripción Premium (tabla PlatformSetting, clave "premium").
 * Se editan desde el panel de administración y se cachean 30 s en memoria.
 */
import { z } from "zod";
import { prisma } from "#srv/prisma";
import { isGatewayConfigured } from "#srv/env";

export const PREMIUM_PLANS = ["MONTHLY", "YEARLY"] as const;
export type PremiumPlan = (typeof PREMIUM_PLANS)[number];
/** Meses que cubre cada cobro. */
export const PLAN_MONTHS: Record<PremiumPlan, number> = { MONTHLY: 1, YEARLY: 12 };

const planSchema = z.object({
  priceUsd: z.number().min(0.5).max(1_000),
  /** ID del plan en PayPal (P-…). Se crea desde el panel con «Sincronizar planes». */
  planId: z.string().max(64),
  /** Precio con el que se creó `planId` (si cambia el precio hay que crear otro plan). */
  planPriceUsd: z.number().min(0).max(1_000),
});

export const premiumSettingsSchema = z.object({
  /** Interruptor general: venta de suscripciones y ventajas para los suscriptores. */
  enabled: z.boolean(),
  plans: z.object({ MONTHLY: planSchema, YEARLY: planSchema }),
  /** Producto de PayPal al que pertenecen los planes. */
  paypalProductId: z.string().max(64),
  /** Espera antes de descargar para los usuarios gratuitos (0 = sin espera). */
  freeDownloadWaitSec: z.number().int().min(0).max(300),
  /**
   * Limitar la velocidad de las descargas gratuitas. Apagado por defecto: solo
   * tiene efecto si además está desplegado el Worker de descargas
   * (DOWNLOAD_GATEWAY_URL / DOWNLOAD_GATEWAY_SECRET).
   */
  freeSpeedLimitEnabled: z.boolean(),
  /** Velocidad de descarga gratuita en KB/s (si el límite está activo). */
  freeDownloadKbps: z.number().int().min(50).max(100_000),
  /** Parte de los ingresos netos de Premium que se reparte entre los creadores. */
  premiumSharePct: z.number().int().min(0).max(90),
});
export type PremiumSettings = z.infer<typeof premiumSettingsSchema>;

export const DEFAULT_PREMIUM: PremiumSettings = {
  enabled: true,
  plans: {
    MONTHLY: { priceUsd: 4.99, planId: "", planPriceUsd: 0 },
    YEARLY: { priceUsd: 39.99, planId: "", planPriceUsd: 0 },
  },
  paypalProductId: "",
  freeDownloadWaitSec: 30,
  freeSpeedLimitEnabled: false,
  freeDownloadKbps: 500,
  premiumSharePct: 50,
};

const KEY = "premium";
const TTL_MS = 30_000;
const g = globalThis as unknown as { __premiumSettings?: { value: PremiumSettings; until: number } };

export async function getPremiumSettings(): Promise<PremiumSettings> {
  const hit = g.__premiumSettings;
  if (hit && hit.until > Date.now()) return hit.value;
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } });
  const raw = (row?.value ?? {}) as Partial<PremiumSettings>;
  const merged = {
    ...DEFAULT_PREMIUM,
    ...raw,
    plans: {
      MONTHLY: { ...DEFAULT_PREMIUM.plans.MONTHLY, ...raw.plans?.MONTHLY },
      YEARLY: { ...DEFAULT_PREMIUM.plans.YEARLY, ...raw.plans?.YEARLY },
    },
  };
  const parsed = premiumSettingsSchema.safeParse(merged);
  if (!parsed.success) console.warn("[premium] ajustes guardados inválidos, se usan los predeterminados:", parsed.error.issues);
  const value = parsed.success ? parsed.data : DEFAULT_PREMIUM;
  g.__premiumSettings = { value, until: Date.now() + TTL_MS };
  return value;
}

export async function savePremiumSettings(value: PremiumSettings): Promise<PremiumSettings> {
  const clean = premiumSettingsSchema.parse(value);
  await prisma.platformSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: clean }, update: { value: clean } });
  g.__premiumSettings = { value: clean, until: Date.now() + TTL_MS };
  return clean;
}

/** El límite de velocidad solo se aplica (y se anuncia) si está activado Y el Worker existe. */
export const speedLimitActive = (s: PremiumSettings) => s.freeSpeedLimitEnabled && isGatewayConfigured();

/** Datos públicos para la página /premium (sin IDs de PayPal). */
export async function publicPremiumInfo() {
  const s = await getPremiumSettings();
  const monthly = s.plans.MONTHLY.priceUsd;
  const yearly = s.plans.YEARLY.priceUsd;
  return {
    enabled: s.enabled,
    plans: {
      MONTHLY: { priceUsd: monthly, available: !!s.plans.MONTHLY.planId },
      YEARLY: { priceUsd: yearly, available: !!s.plans.YEARLY.planId },
    },
    /** Ahorro del plan anual frente a 12 meses del mensual (%). */
    yearlySavingPct: monthly > 0 ? Math.max(0, Math.round((1 - yearly / (monthly * 12)) * 100)) : 0,
    freeDownloadWaitSec: s.freeDownloadWaitSec,
    freeDownloadKbps: s.freeDownloadKbps,
    /** Si los gratuitos tienen la velocidad limitada (si no, no se anuncia «sin límite»). */
    speedLimit: speedLimitActive(s),
    premiumSharePct: s.premiumSharePct,
  };
}
export type PublicPremiumInfo = Awaited<ReturnType<typeof publicPremiumInfo>>;
