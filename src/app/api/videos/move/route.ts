import { NextResponse } from "next/server";
import { z } from "zod";
import { isPublicVideoId } from "@/lib/ids";
import { requireApiUser } from "@/server/auth/session";
import { readJson, route } from "@/server/http";
import { moveVideos } from "@/server/videos/service";

const schema = z.object({
  videoIds: z.array(z.string().refine(isPublicVideoId, "invalidVideoId")).min(1).max(500),
  folderId: z.string().max(40).nullable(),
});

/** POST /api/videos/move — mueve varios videos a una carpeta (`null` = sin carpeta). */
export const POST = route(async (req) => {
  const user = await requireApiUser();
  const { videoIds, folderId } = schema.parse(await readJson(req));
  return NextResponse.json(await moveVideos(user.id, videoIds, folderId));
});
