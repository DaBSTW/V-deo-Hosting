import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionCookie, signSession } from "@/server/auth/jwt";
import { burnPasswordCheck, verifyPassword } from "@/server/auth/password";
import { credentialsSchema } from "@/server/auth/schemas";
import { HttpError, readJson, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const POST = route(async (req) => {
  const { email, password } = credentialsSchema.parse(await readJson(req));
  rateLimit(`login:${clientIp(req)}`, 20, 15 * 60 * 1000);
  rateLimit(`login:${email}`, 10, 15 * 60 * 1000);

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : await burnPasswordCheck(password).then(() => false);
  if (!user || !valid) throw new HttpError(401, "invalidCredentials");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(await signSession({ sub: user.id, email: user.email })));
  return res;
});
