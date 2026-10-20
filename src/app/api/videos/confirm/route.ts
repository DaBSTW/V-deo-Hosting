import { NextResponse } from "next/server";
import { z } from "zod";
import { isPublicVideoId } from "@/lib/ids";
import { requireApiUser } from "@/server/auth/session";
import { readJson, route } from "@/server/http";
import { confirmUpload } from "@/server/videos/service";

const schema = z.object({
  videoId: z.string().refine(isPublicVideoId, "videoId inválido"),
  durationSec: z.number().positive().max(7 * 24 * 3600).nullish(),
  /** El navegador subió la miniatura que capturó del archivo local. */
  hasThumbnail: z.boolean().optional(),
});

/**
 * POST /api/videos/confirm
 * El navegador avisa de que terminó la subida; el backend lo verifica contra
 * el proveedor y activa el video (READY o PROCESSING).
 */
export const POST = route(async (req) => {
  const user = await requireApiUser();
  const { videoId, ...hints } = schema.parse(await readJson(req));
  return NextResponse.json({ video: await confirmUpload(user.id, videoId, hints) });
});
