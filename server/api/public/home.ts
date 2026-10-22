import { handler, json, methods } from "#srv/http";
import { getCoreEnv } from "#srv/env";
import { DEFAULT_SETTINGS, MIN_PAYOUT_USD, getMonetizationSettings, parseMetaTag } from "#srv/monetization/settings";

/**
 * GET /api/public/home — datos públicos de la portada: reparto de ingresos
 * (solo si la monetización está activa), límites y la etiqueta de verificación.
 */
const GET = handler(async () => {
  const settings = await getMonetizationSettings().catch(() => DEFAULT_SETTINGS);
  const { APP_URL, MAX_UPLOAD_MB } = getCoreEnv();
  return json({
    appUrl: APP_URL,
    maxUploadBytes: MAX_UPLOAD_MB * 1024 * 1024,
    minPayoutUsd: MIN_PAYOUT_USD,
    minWatchSeconds: settings.minWatchSeconds,
    /** Porcentaje del RPM real que reciben los creadores (reparto de ingresos). */
    revenueSharePct: settings.enabled ? settings.revenueSharePct : null,
    verificationMeta: parseMetaTag(settings.monetagMetaTag),
  });
});

export default methods({ GET });
