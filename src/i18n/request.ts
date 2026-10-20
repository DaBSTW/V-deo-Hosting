import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale } from "./config";
import { messagesFor } from "./messages";

/** Configuración por petición para next-intl (sin prefijo de idioma en la URL). */
export default getRequestConfig(async () => {
  const [store, hdrs] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value, hdrs.get("accept-language"));
  return { locale, messages: messagesFor(locale) };
});
