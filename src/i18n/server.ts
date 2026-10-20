/**
 * Utilidades de i18n para Route Handlers (fuera del árbol de React):
 * idioma de la petición y traductor síncrono.
 */
import { createTranslator } from "next-intl";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, resolveLocale, type AppLocale } from "./config";
import { messagesFor } from "./messages";

export const localeFromRequest = (req: Request | NextRequest): AppLocale => {
  const cookie = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1];
  return resolveLocale(cookie ?? undefined, req.headers.get("accept-language"));
};

export const translatorFor = (locale: AppLocale) => createTranslator({ locale, messages: messagesFor(locale) });

export { LOCALE_COOKIE };
