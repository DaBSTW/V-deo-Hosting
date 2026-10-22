import { isPublicVideoId } from "#shared/lib/ids";
import { getCoreEnv } from "#srv/env";
import { handler, json, methods } from "#srv/http";
import { embedUrlFor } from "#srv/videos/dto";
import { getEmbedPlayback } from "#srv/videos/service";
import { premiumFromCookieHeader } from "#srv/premium/token";
import { getPremiumSettings } from "#srv/premium/settings";

/**
 * GET /api/public/videos/:publicId — datos de reproducción para /v y /embed.
 * Solo rutas opacas propias (/media/…); nunca URLs ni nombres del proveedor.
 */
const GET = handler(async (req) => {
  const { publicId } = req.params;
  // Pase Premium de la cookie (firma HMAC, sin consultar la DB): sin anuncios.
  const premium = !!premiumFromCookieHeader(req.headers.get("cookie"));
  const data = isPublicVideoId(publicId) ? await getEmbedPlayback(publicId, { premium }) : { state: "not_found" as const };
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
  if (data.state === "not_found") return json(data, { status: 404, headers });
  return json(
    {
      ...data,
      watchUrl: `${getCoreEnv().APP_URL}/v/${publicId}`,
      embedUrl: embedUrlFor(publicId),
      viewer: { premium },
      // Oferta para los no suscriptores (ajustes en caché: sin consultar la DB).
      offer: premium ? null : await premiumOffer(),
    },
    { headers },
  );
});

async function premiumOffer() {
  const s = await getPremiumSettings();
  if (!s.enabled) return null;
  return { monthlyUsd: s.plans.MONTHLY.priceUsd, yearlyUsd: s.plans.YEARLY.priceUsd, waitSec: s.freeDownloadWaitSec };
}

export default methods({ GET });
