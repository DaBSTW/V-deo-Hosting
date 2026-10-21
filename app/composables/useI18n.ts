import { LOCALE_COOKIE, resolveLocale, type AppLocale } from "#shared/i18n/config";
import { messagesFor } from "#shared/i18n/messages";
import { createTranslator, type Translator } from "#shared/i18n/translator";

const translators = new Map<AppLocale, Translator>();
const translatorFor = (locale: AppLocale) => {
  let t = translators.get(locale);
  if (!t) translators.set(locale, (t = createTranslator(locale, messagesFor(locale))));
  return t;
};

/**
 * Idioma activo (cookie → Accept-Language → inglés). Se decide en el
 * servidor y viaja al navegador en el payload: no hay parpadeo al hidratar.
 */
export function useLocale() {
  return useState<AppLocale>("locale", () => {
    const cookie = useCookie<string | undefined>(LOCALE_COOKIE).value;
    const accept = import.meta.server ? (useRequestHeaders(["accept-language"])["accept-language"] ?? null) : navigator.language;
    return resolveLocale(cookie, accept);
  });
}

/** `t` reactivo al idioma. Uso: `const { t } = useI18n(); t("landing.hero.title")`. */
export function useI18n() {
  const locale = useLocale();
  const cookie = useCookie<string | undefined>(LOCALE_COOKIE, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  const translator = computed(() => translatorFor(locale.value));
  const t = ((key, values) => translator.value(key, values)) as Translator;
  t.dynamic = (key, values) => translator.value.dynamic(key, values);
  t.has = (key) => translator.value.has(key);
  t.raw = (key) => translator.value.raw(key);
  t.rich = (key, values) => translator.value.rich(key, values);
  Object.defineProperty(t, "locale", { get: () => locale.value });

  const setLocale = (next: AppLocale) => {
    cookie.value = next;
    locale.value = next;
  };
  return { t, locale, setLocale };
}
