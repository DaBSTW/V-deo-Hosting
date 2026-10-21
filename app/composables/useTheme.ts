export type Theme = "dark" | "light";

/** Tema de color (oscuro por defecto, como Modrinth). Se guarda en una cookie. */
export function useTheme() {
  const cookie = useCookie<Theme>("theme", { default: () => "dark", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  const theme = useState<Theme>("theme", () => (cookie.value === "light" ? "light" : "dark"));
  const setTheme = (next: Theme) => {
    cookie.value = next;
    theme.value = next;
  };
  return { theme, setTheme, toggle: () => setTheme(theme.value === "dark" ? "light" : "dark") };
}
