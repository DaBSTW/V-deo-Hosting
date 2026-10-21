import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods } from "#srv/http";
import { getDashboardStats } from "#srv/videos/stats";

/** GET /api/stats — series diarias de vistas/descargas del usuario (180 días). */
const GET = handler(async () => {
  const user = await requireApiUser();
  return json(await getDashboardStats(user.id));
});

export default methods({ GET });
