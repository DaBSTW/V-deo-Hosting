import { requireApiUser } from "#srv/auth/session";
import { handler, json, methods } from "#srv/http";
import { cancelUserSubscription, getUserPremium } from "#srv/premium/service";
import { premiumCookieHeader } from "#srv/premium/token";

/** POST /api/premium/cancel — cancela la renovación; el periodo ya pagado se conserva. */
const POST = handler(async () => {
  const user = await requireApiUser();
  const { premiumUntil } = await cancelUserSubscription(user.id);
  const res = json(await getUserPremium(user.id));
  res.headers.append("Set-Cookie", premiumCookieHeader(user.id, premiumUntil));
  return res;
});

export default methods({ POST });
