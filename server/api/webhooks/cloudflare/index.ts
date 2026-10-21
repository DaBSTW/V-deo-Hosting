import { handler, json, methods } from "#srv/http";
import { handleProviderWebhook } from "#srv/videos/service";

/**
 * POST /api/webhooks/cloudflare
 * Receptor genérico: cada adaptador reconoce y valida (HMAC) sus propios
 * webhooks. Requiere el cuerpo crudo para verificar la firma.
 */
const POST = handler(async (req) => {
  const rawBody = await req.text();
  const result = await handleProviderWebhook({ rawBody, headers: req.headers });
  return json({ ok: true, ...result });
});

export default methods({ POST }, { csrf: false });
