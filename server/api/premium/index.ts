import { getSessionUser } from "#srv/auth/session";
import { handler, json, methods } from "#srv/http";
import { getUserPremium } from "#srv/premium/service";
import { publicPremiumInfo } from "#srv/premium/settings";

/** GET /api/premium — planes y ventajas (público) + estado del usuario si hay sesión. */
const GET = handler(async () => {
  const user = await getSessionUser();
  const [info, mine] = await Promise.all([publicPremiumInfo(), user ? getUserPremium(user.id) : null]);
  return json({ info, mine }, { headers: { "Cache-Control": "private, no-store" } });
});

export default methods({ GET });
