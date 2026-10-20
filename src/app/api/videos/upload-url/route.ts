import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { readJson, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { createUpload } from "@/server/videos/service";

const schema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  mimeType: z
    .string()
    .regex(/^video\/[a-z0-9.+-]+$/i, "Solo se admiten archivos de video")
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
export const POST = route(async (req) => {
  const user = await requireApiUser();
  rateLimit(`upload:${user.id}`, 60, 60 * 60 * 1000);
  rateLimit(`upload-ip:${clientIp(req)}`, 120, 60 * 60 * 1000);

  const input = schema.parse(await readJson(req));
  return NextResponse.json(await createUpload(user.id, input), { status: 201 });
});
