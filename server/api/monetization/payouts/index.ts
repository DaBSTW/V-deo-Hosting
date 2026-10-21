import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods } from "#srv/http";
import { clientIp, rateLimit } from "#srv/rate-limit";
import { getMonetizationOverview, requestPayout } from "#srv/monetization/earnings";

/** POST /api/monetization/payouts — solicita el cobro del saldo disponible. */
const POST = handler(async (req) => {
  const user = await requireApiUser();
  rateLimit(`payout:${user.id}:${clientIp(req)}`, 5, 60 * 60 * 1000);
  await requestPayout(user.id);
  return json(await getMonetizationOverview(user.id), { status: 201 });
});

export default methods({ POST });
