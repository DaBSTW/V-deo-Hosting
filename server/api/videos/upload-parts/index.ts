import { z } from "zod";
import { isPublicVideoId } from "#shared/lib/ids";
import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, readJson } from "#srv/http";
import { rateLimit } from "#srv/rate-limit";
import { MAX_PART_URLS_PER_REQUEST, getUploadPartUrls } from "#srv/videos/service";

const schema = z.object({
  videoId: z.string().refine(isPublicVideoId, "invalidVideoId"),
  parts: z.array(z.number().int().min(1).max(10_000)).min(1).max(MAX_PART_URLS_PER_REQUEST),
});

/**
 * POST /api/videos/upload-parts
 * Subidas grandes (por partes): devuelve `{ urls: { "<n>": url } }` para subir
 * esas partes directo al almacenamiento. El navegador las pide por lotes.
 */
const POST = handler(async (req) => {
  const user = await requireApiUser();
  rateLimit(`upload-parts:${user.id}`, 2_000, 60 * 60 * 1000);
  const { videoId, parts } = schema.parse(await readJson(req));
  return json({ urls: await getUploadPartUrls(user.id, videoId, parts) });
});

export default methods({ POST });
