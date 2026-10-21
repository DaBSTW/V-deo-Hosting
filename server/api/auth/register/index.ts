import { getCoreEnv } from "#srv/env";
import { prisma } from "#srv/prisma";
import { signSession, withSessionCookie } from "#srv/auth/jwt";
import { hashPassword } from "#srv/auth/password";
import { registerSchema } from "#srv/auth/schemas";
import { HttpError, handler, json, methods, readJson } from "#srv/http";
import { clientIp, rateLimit } from "#srv/rate-limit";

const POST = handler(async (req) => {
  if (!getCoreEnv().ALLOW_REGISTRATION) throw new HttpError(403, "registrationDisabled");
  rateLimit(`register:${clientIp(req)}`, 5, 60 * 60 * 1000);

  const { email, password, name } = registerSchema.parse(await readJson(req));
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new HttpError(409, "emailTaken");
  }

  const user = await prisma.user.create({
    data: { email, name: name || null, passwordHash: await hashPassword(password), termsAcceptedAt: new Date() },
  });

  return withSessionCookie(json({ ok: true }, { status: 201 }), await signSession({ sub: user.id, email: user.email }));
});

export default methods({ POST });
