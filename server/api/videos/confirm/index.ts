import { z } from "zod";
import { isPublicVideoId } from "#shared/lib/ids";
import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, readJson } from "#srv/http";
import { confirmUpload } from "#srv/videos/service";

const schema = z.object({
  videoId: z.string().refine(isPublicVideoId, "invalidVideoId"),
  durationSec: z.number().positive().max(7 * 24 * 3600).nullish(),
  /** El navegador subió la miniatura que capturó del archivo local. */
  hasThumbnail: z.boolean().optional(),
});

/**
 * POST /api/videos/confirm
 * El navegador avisa de que terminó la subida; el backend lo verifica contra
 * el proveedor y activa el video (READY o PROCESSING).
 */
const POST = handler(async (req) => {
  const user = await requireApiUser();
  const { videoId, ...hints } = schema.parse(await readJson(req));
  return json({ video: await confirmUpload(user.id, videoId, hints) });
});

export default methods({ POST });
