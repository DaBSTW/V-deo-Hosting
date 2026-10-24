import { handler, json, methods } from "#srv/http";
import { getCoreEnv } from "#srv/env";
import { DEFAULT_PREMIUM, getPremiumSettings, speedLimitActive } from "#srv/premium/settings";
import { DEFAULT_SETTINGS, MIN_PAYOUT_USD, getMonetizationSettings, parseMetaTag } from "#srv/monetization/settings";
import { lastCreatorRpm } from "#srv/monetization/settlement";

/** Países de la calculadora de la portada. */
const CALC_COUNTRIES = ["MX", "ES", "US", "AR", "CO"] as const;
/**
 * RPM de Monetag de ejemplo (USD por 1.000 vistas) mientras no haya ningún
 * cierre mensual real. La portada lo indica como «ejemplo».
 */
const EXAMPLE_RPM: Record<(typeof CALC_COUNTRIES)[number], number> = { MX: 1.4, ES: 3.2, US: 5.8, AR: 0.9, CO: 1.1 };

/** RPM para el creador por país (último cierre real), cacheado 10 min: la portada no consulta la DB en cada visita. */
let calcCache: { until: number; value: { month: string | null; countries: { code: string; creatorRpm: number }[] } } | null = null;
async function calculator(sharePct: number) {
  if (calcCache && calcCache.until > Date.now()) return calcCache.value;
  const last = await lastCreatorRpm().catch(() => null);
  const value = last
    ? { month: last.month, countries: CALC_COUNTRIES.map((code) => ({ code, creatorRpm: last.of(code) / 1e6 })) }
    : { month: null, countries: CALC_COUNTRIES.map((code) => ({ code, creatorRpm: (EXAMPLE_RPM[code] * sharePct) / 100 })) };
  calcCache = { until: Date.now() + 10 * 60_000, value };
  return value;
}

/**
 * GET /api/public/home — datos públicos de la portada: reparto de ingresos
 * (solo si la monetización está activa), límites y la etiqueta de verificación.
 */
const GET = handler(async () => {
  const settings = await getMonetizationSettings().catch(() => DEFAULT_SETTINGS);
  const premium = await getPremiumSettings().catch(() => DEFAULT_PREMIUM);
  const { APP_URL, MAX_UPLOAD_MB } = getCoreEnv();
  return json({
    appUrl: APP_URL,
    maxUploadBytes: MAX_UPLOAD_MB * 1024 * 1024,
    minPayoutUsd: MIN_PAYOUT_USD,
    minWatchSeconds: settings.minWatchSeconds,
    /** Porcentaje del RPM real que reciben los creadores (reparto de ingresos). */
    revenueSharePct: settings.enabled ? settings.revenueSharePct : null,
    verificationMeta: parseMetaTag(settings.monetagMetaTag),
    /** Calculadora: RPM para el creador del último cierre (`month`) o de ejemplo (`month: null`). */
    calculator: await calculator(settings.revenueSharePct),
    premium: premium.enabled
      ? { monthlyUsd: premium.plans.MONTHLY.priceUsd, yearlyUsd: premium.plans.YEARLY.priceUsd, waitSec: premium.freeDownloadWaitSec, sharePct: premium.premiumSharePct, speedLimit: speedLimitActive(premium) }
      : null,
  });
});

export default methods({ GET });
