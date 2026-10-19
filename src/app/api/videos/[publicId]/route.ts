import { NextResponse } from "next/server";
import { isPublicVideoId } from "@/lib/ids";
import { requireApiUser } from "@/server/auth/session";
import { HttpError, route } from "@/server/http";
import { deleteVideo, getVideo } from "@/server/videos/service";

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

/** DELETE /api/videos/:publicId — borra el remoto (vía adaptador) y el registro local. */
export const DELETE = route<Ctx>(async (_req, ctx) => {
  const user = await requireApiUser();
  await deleteVideo(user.id, await publicIdFrom(ctx));
  return new NextResponse(null, { status: 204 });
});
