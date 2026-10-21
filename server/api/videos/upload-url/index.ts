import { z } from "zod";
import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, readJson } from "#srv/http";
import { clientIp, rateLimit } from "#srv/rate-limit";
import { createUpload } from "#srv/videos/service";

const schema = z.object({
  title: z.string().trim().min(1, "titleRequired").max(200),
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  mimeType: z
    .string()
    .regex(/^video\/[a-z0-9.+-]+$/i, "videoFilesOnly")
    .transform((v) => v.toLowerCase()),
  folderId: z.string().max(40).nullish(),
});

/**
 * POST /api/videos/upload-url
 * Devuelve `{ videoId, upload, thumbnailUpload? }`: el id público y las
 * instrucciones genéricas de subida directa (URL prefirmada o sesión
 * reanudable) y, si el proveedor no genera miniaturas, dónde subir la que
 * captura el navegador. Sin credenciales.
 */
const POST = handler(async (req) => {
  const user = await requireApiUser();
  rateLimit(`upload:${user.id}`, 60, 60 * 60 * 1000);
  rateLimit(`upload-ip:${clientIp(req)}`, 120, 60 * 60 * 1000);

  const input = schema.parse(await readJson(req));
  return json(await createUpload(user.id, input), { status: 201 });
});

export default methods({ POST });
