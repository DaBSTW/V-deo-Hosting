import { isAdmin } from "#srv/auth/admin";
import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods } from "#srv/http";
import { isPremium } from "#srv/premium/service";
import { listFolders, listVideos, maxUploadBytes } from "#srv/videos/service";
import { getDashboardStats } from "#srv/videos/stats";

/** GET /api/dashboard — datos iniciales del panel en una sola petición. */
const GET = handler(async () => {
  const user = await requireApiUser();
  const [videos, folders, stats] = await Promise.all([
    listVideos(user.id),
    listFolders(user.id),
    getDashboardStats(user.id),
  ]);
  return json({
    user: { email: user.email, name: user.name, isAdmin: isAdmin(user.email), premium: isPremium(user.premiumUntil) },
    videos,
    folders,
    stats,
    maxBytes: maxUploadBytes(),
  });
});

export default methods({ GET });
