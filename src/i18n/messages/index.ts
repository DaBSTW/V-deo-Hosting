import type { AppLocale } from "../config";
import en from "./en";
import es from "./es";

export const messagesFor = (locale: AppLocale) => (locale === "es" ? es : en);
