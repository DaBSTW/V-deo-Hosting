import { z } from "zod";
import { isPublicVideoId } from "#shared/lib/ids";
import { HttpError, handler, json, methods, readJson } from "#srv/http";
import { clientIp, rateLimit } from "#srv/rate-limit";
import { premiumFromCookieHeader } from "#srv/premium/token";
import { createDownloadTicket } from "#srv/videos/service";

const schema = z.object({ option: z.string().max(40) });

/**
 * POST /api/public/videos/:publicId/download — canjea la calidad elegida por
 * un ticket. Gratuitos: `waitSec` de espera (el enlace no vale antes) y
 * velocidad limitada. Premium: enlace inmediato a velocidad completa.
 */
const POST = handler(async (req) => {
  const { publicId } = req.params;
  if (!isPublicVideoId(publicId)) throw new HttpError(404, "downloadUnavailable");
  rateLimit(`dl-ticket:${clientIp(req)}`, 30, 60_000);
  const { option } = schema.parse(await readJson(req));
  const premium = !!premiumFromCookieHeader(req.headers.get("cookie"));
  return json({ ...(await createDownloadTicket(publicId, option, premium)), premium }, { headers: { "Cache-Control": "private, no-store" } });
});

export default methods({ POST });
