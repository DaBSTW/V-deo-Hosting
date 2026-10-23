import { z } from "zod";
import { MAX_INTRO_SEC } from "#shared/lib/player-settings";
import { isPublicVideoId } from "#shared/lib/ids";
import { requireApiUser } from "#srv/auth/session";
import { HttpError, handler, type ApiRequest, json, methods, noContent, readJson } from "#srv/http";
import { deleteVideo, getVideo, updateVideo } from "#srv/videos/service";

function publicIdFrom(req: ApiRequest) {
  const { publicId } = req.params;
  if (!isPublicVideoId(publicId)) throw new HttpError(404, "videoNotFound");
  return publicId;
}

/** GET /api/videos/:publicId */
const GET = handler(async (req) => {
  const user = await requireApiUser();
  return json({ video: await getVideo(user.id, publicIdFrom(req)) });
});

const patchSchema = z
  .object({
    title: z.string().trim().min(1, "titleRequired").max(200).optional(),
    folderId: z.string().max(40).nullable().optional(),
    allowDownload: z.boolean().optional(),
    /** Tramo «Saltar intro» en segundos; `null` = usar la intro predeterminada del reproductor. */
    intro: z
      .object({ start: z.number().int().min(0).max(24 * 3600), end: z.number().int().min(0).max(24 * 3600) })
      .refine((v) => v.end > v.start && v.end - v.start <= MAX_INTRO_SEC, "invalidIntro")
      .nullable()
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "nothingToUpdate");

/**
 * PATCH /api/videos/:publicId — renombrar, mover de carpeta (`folderId: null` =
 * sin carpeta), activar/desactivar la descarga pública (`allowDownload`) o
 * marcar la intro para el botón «Saltar intro» (`intro`).
 */
const PATCH = handler(async (req) => {
  const user = await requireApiUser();
  const patch = patchSchema.parse(await readJson(req));
  return json({ video: await updateVideo(user.id, publicIdFrom(req), patch) });
});

/** DELETE /api/videos/:publicId — borra el remoto (vía adaptador) y el registro local. */
const DELETE = handler(async (req) => {
  const user = await requireApiUser();
  await deleteVideo(user.id, publicIdFrom(req));
  return noContent();
});

export default methods({ GET, PATCH, DELETE });
