import { NextResponse } from "next/server";
import { getCoreEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sessionCookie, signSession } from "@/server/auth/jwt";
import { hashPassword } from "@/server/auth/password";
import { registerSchema } from "@/server/auth/schemas";
import { HttpError, readJson, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const POST = route(async (req) => {
  if (!getCoreEnv().ALLOW_REGISTRATION) throw new HttpError(403, "El registro está deshabilitado");
  rateLimit(`register:${clientIp(req)}`, 5, 60 * 60 * 1000);

  const { email, password, name } = registerSchema.parse(await readJson(req));
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new HttpError(409, "Ya existe una cuenta con ese email");
  }

  const user = await prisma.user.create({
    data: { email, name: name || null, passwordHash: await hashPassword(password) },
  });

  const res = NextResponse.json({ ok: true }, { status: 201 });
  res.cookies.set(sessionCookie(await signSession({ sub: user.id, email: user.email })));
  return res;
});
