import { withSessionCookie } from "#srv/auth/jwt";
import { handler, json, methods } from "#srv/http";
import { clearPremiumCookieHeader } from "#srv/premium/token";

const POST = handler(async () => {
  const res = withSessionCookie(json({ ok: true }), null);
  res.headers.append("Set-Cookie", clearPremiumCookieHeader());
  return res;
});

export default methods({ POST });
