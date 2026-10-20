import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { HttpError } from "../http";
import { SESSION_COOKIE, verifySession } from "./jwt";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/** Usuario autenticado (verifica que siga existiendo en la DB) o `null`. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  return prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, name: true },
  });
}

/** Para Route Handlers: lanza 401 si no hay sesión. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "unauthenticated");
  return user;
}

/** Para Server Components: redirige al login si no hay sesión. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
