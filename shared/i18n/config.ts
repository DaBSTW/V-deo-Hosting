/**
 * Idiomas de la plataforma. El idioma se detecta automáticamente
 * (cookie `NEXT_LOCALE` si el usuario lo eligió → cabecera Accept-Language del
 * navegador → inglés como respaldo) y NO forma parte de la URL: los enlaces
 * de embed y de videos son los mismos en todos los idiomas.
 */
export const LOCALES = ["es", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
/** Si el navegador no prefiere ninguno de los disponibles. */
export const FALLBACK_LOCALE: AppLocale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const isLocale = (v: unknown): v is AppLocale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** Elige el mejor idioma disponible según `Accept-Language` (respeta los pesos q=). */
export function negotiateLocale(acceptLanguage: string | null | undefined): AppLocale {
  const prefs = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { lang: tag.toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((p) => p.lang && p.q > 0)
    .sort((a, b) => b.q - a.q);
  return prefs.map((p) => p.lang).find(isLocale) ?? FALLBACK_LOCALE;
}

export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): AppLocale {
  return isLocale(cookieValue) ? cookieValue : negotiateLocale(acceptLanguage);
}
