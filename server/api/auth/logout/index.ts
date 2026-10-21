import { withSessionCookie } from "#srv/auth/jwt";
import { handler, json, methods } from "#srv/http";

const POST = handler(async () => withSessionCookie(json({ ok: true }), null));

export default methods({ POST });
