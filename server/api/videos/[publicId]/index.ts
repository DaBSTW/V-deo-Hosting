import { z } from "zod";
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
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "nothingToUpdate");

/**
 * PATCH /api/videos/:publicId — renombrar, mover de carpeta (`folderId: null` =
 * sin carpeta) o activar/desactivar la descarga pública (`allowDownload`).
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
