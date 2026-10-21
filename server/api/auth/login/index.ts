import { prisma } from "#srv/prisma";
import { signSession, withSessionCookie } from "#srv/auth/jwt";
import { burnPasswordCheck, verifyPassword } from "#srv/auth/password";
import { credentialsSchema } from "#srv/auth/schemas";
import { HttpError, handler, json, methods, readJson } from "#srv/http";
import { clientIp, rateLimit } from "#srv/rate-limit";

const POST = handler(async (req) => {
  const { email, password } = credentialsSchema.parse(await readJson(req));
  rateLimit(`login:${clientIp(req)}`, 20, 15 * 60 * 1000);
  rateLimit(`login:${email}`, 10, 15 * 60 * 1000);

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : await burnPasswordCheck(password).then(() => false);
  if (!user || !valid) throw new HttpError(401, "invalidCredentials");

  return withSessionCookie(json({ ok: true }), await signSession({ sub: user.id, email: user.email }));
});

export default methods({ POST });
