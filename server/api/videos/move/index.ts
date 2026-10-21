import { z } from "zod";
import { isPublicVideoId } from "#shared/lib/ids";
import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods, readJson } from "#srv/http";
import { moveVideos } from "#srv/videos/service";

const schema = z.object({
  videoIds: z.array(z.string().refine(isPublicVideoId, "invalidVideoId")).min(1).max(500),
  folderId: z.string().max(40).nullable(),
});

/** POST /api/videos/move — mueve varios videos a una carpeta (`null` = sin carpeta). */
const POST = handler(async (req) => {
  const user = await requireApiUser();
  const { videoIds, folderId } = schema.parse(await readJson(req));
  return json(await moveVideos(user.id, videoIds, folderId));
});

export default methods({ POST });
