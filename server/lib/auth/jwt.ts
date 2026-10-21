/**
 * Sesiones JWT (HS256) en cookie httpOnly.
 * Lee `process.env` directamente y no depende de Node APIs (sirve también en
 * el middleware de rutas del servidor).
 */
import { serialize } from "cookie-es";
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "vh_session";
export const SESSION_TTL_SEC = 7 * 24 * 3600;

export interface SessionClaims {
  sub: string;
  email: string;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET no configurado (mín. 32 caracteres)");
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SEC}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SEC,
  };
}

/** Cabecera `Set-Cookie` para una cookie como la de `sessionCookie()`. */
export function serializeCookie(c: ReturnType<typeof sessionCookie> | { name: string; value: string; path: string; maxAge: number }) {
  const { name, value, ...opts } = c;
  return serialize(name, value, opts);
}

/** Respuesta JSON que además fija (o borra) la cookie de sesión. */
export function withSessionCookie(res: Response, token: string | null): Response {
  res.headers.append(
    "Set-Cookie",
    serializeCookie(token ? sessionCookie(token) : { name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 }),
  );
  return res;
}
