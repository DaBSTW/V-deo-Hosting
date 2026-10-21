/**
 * i18n en el servidor: idioma de la petición y traductor síncrono.
 */
import { LOCALE_COOKIE, resolveLocale, type AppLocale } from "#shared/i18n/config";
import { messagesFor } from "#shared/i18n/messages";
import { createTranslator, type Translator } from "#shared/i18n/translator";

const COOKIE_RE = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`);

export const localeFromRequest = (req: { headers: Headers }): AppLocale => {
  const cookie = COOKIE_RE.exec(req.headers.get("cookie") ?? "")?.[1];
  return resolveLocale(cookie ?? undefined, req.headers.get("accept-language"));
};

const translators = new Map<AppLocale, Translator>();
export const translatorFor = (locale: AppLocale): Translator => {
  let t = translators.get(locale);
  if (!t) translators.set(locale, (t = createTranslator(locale, messagesFor(locale))));
  return t;
};

export { LOCALE_COOKIE };
