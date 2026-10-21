import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods } from "#srv/http";
import { listVideos } from "#srv/videos/service";

/** GET /api/videos — lista de videos del usuario (solo campos públicos). */
const GET = handler(async () => {
  const user = await requireApiUser();
  return json({ videos: await listVideos(user.id) });
});

export default methods({ GET });
