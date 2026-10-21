import { getCookie } from "h3";
import { useEvent } from "nitropack/runtime";
import { prisma } from "#srv/prisma";
import { HttpError } from "../http";
import { SESSION_COOKIE, verifySession } from "./jwt";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Usuario autenticado (verifica que siga existiendo en la DB) o `null`.
 * Lee la cookie de la petición en curso (contexto asíncrono de Nitro).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const claims = await verifySession(getCookie(useEvent(), SESSION_COOKIE));
  if (!claims) return null;
  return prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, name: true },
  });
}

/** Para la API: lanza 401 si no hay sesión. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "unauthenticated");
  return user;
}
