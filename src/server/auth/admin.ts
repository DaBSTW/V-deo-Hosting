import { getCoreEnv } from "@/lib/env";
import { HttpError } from "../http";
import { requireApiUser, type SessionUser } from "./session";

/** Administradores definidos por ADMIN_EMAILS (sin roles en la DB). */
export const isAdmin = (email: string) => getCoreEnv().ADMIN_EMAILS.includes(email.toLowerCase());

export async function requireApiAdmin(): Promise<SessionUser> {
  const user = await requireApiUser();
  if (!isAdmin(user.email)) throw new HttpError(403, "Solo para administradores");
  return user;
}
