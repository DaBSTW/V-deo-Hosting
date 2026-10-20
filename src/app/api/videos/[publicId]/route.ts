import { NextResponse } from "next/server";
import { z } from "zod";
import { isPublicVideoId } from "@/lib/ids";
import { requireApiUser } from "@/server/auth/session";
import { HttpError, readJson, route } from "@/server/http";
import { deleteVideo, getVideo, updateVideo } from "@/server/videos/service";

type Ctx = { params: Promise<{ publicId: string }> };

async function publicIdFrom(ctx: Ctx) {
  const { publicId } = await ctx.params;
  if (!isPublicVideoId(publicId)) throw new HttpError(404, "Video no encontrado");
  return publicId;
}

/** GET /api/videos/:publicId */
export const GET = route<Ctx>(async (_req, ctx) => {
  const user = await requireApiUser();
  return NextResponse.json({ video: await getVideo(user.id, await publicIdFrom(ctx)) });
});

const patchSchema = z
  .object({
    title: z.string().trim().min(1, "El título es obligatorio").max(200).optional(),
    folderId: z.string().max(40).nullable().optional(),
    allowDownload: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nada que actualizar");

/**
 * PATCH /api/videos/:publicId — renombrar, mover de carpeta (`folderId: null` =
 * sin carpeta) o activar/desactivar la descarga pública (`allowDownload`).
 */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const user = await requireApiUser();
  const patch = patchSchema.parse(await readJson(req));
  return NextResponse.json({ video: await updateVideo(user.id, await publicIdFrom(ctx), patch) });
});

/** DELETE /api/videos/:publicId — borra el remoto (vía adaptador) y el registro local. */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const user = await requireApiUser();
  await deleteVideo(user.id, await publicIdFrom(ctx));
  return new NextResponse(null, { status: 204 });
});
