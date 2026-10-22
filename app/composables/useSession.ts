export interface SessionUser {
  email: string;
  name: string | null;
  isAdmin: boolean;
  premium: boolean;
  premiumUntil: string | null;
}

/** Usuario de la sesión, cargado una vez por visita (plugin `session`). */
export function useSession() {
  const user = useState<SessionUser | null>("session-user", () => null);
  const refresh = async () => {
    const res = await useRequestFetch()<{ user: SessionUser | null }>("/api/auth/me").catch(() => ({ user: null }));
    user.value = res.user;
    return user.value;
  };
  const logout = async () => {
    await $fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    user.value = null;
    await navigateTo("/");
  };
  return { user, refresh, logout };
}
