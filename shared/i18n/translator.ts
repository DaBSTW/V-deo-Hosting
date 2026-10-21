/**
 * Traductor ICU mínimo (intl-messageformat) usado igual en el servidor y en
 * el navegador. Los mensajes siguen el formato ICU: {variable}, plurales y
 * etiquetas `<tag>…</tag>` para texto enriquecido.
 */
import { IntlMessageFormat } from "intl-messageformat";
import type { AppLocale } from "./config";
import type { Messages } from "./messages/es";

/** Claves con puntos ("landing.hero.title") de los mensajes que son texto. */
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Messages>;

export type MessageValues = Record<string, string | number | Date>;
/** Función que recibe el contenido de una etiqueta (`<link>contenido</link>`). */
export type TagFn<R> = (chunks: Array<string | R>) => R;

export interface Translator {
  (key: MessageKey, values?: MessageValues): string;
  /** Igual que `t` pero con claves construidas en tiempo de ejecución. */
  dynamic(key: string, values?: MessageValues): string;
  has(key: string): boolean;
  raw(key: string): unknown;
  /** Texto enriquecido: devuelve trozos (texto y lo que devuelvan las etiquetas). */
  rich<R>(key: MessageKey, values?: Record<string, string | number | TagFn<R>>): Array<string | R>;
  locale: AppLocale;
}

export function createTranslator(locale: AppLocale, messages: Messages): Translator {
  const cache = new Map<string, IntlMessageFormat>();
  const lookup = (key: string): unknown =>
    key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);

  const formatter = (key: string): IntlMessageFormat | null => {
    const source = lookup(key);
    if (typeof source !== "string") return null;
    let f = cache.get(key);
    if (!f) {
      f = new IntlMessageFormat(source, locale);
      cache.set(key, f);
    }
    return f;
  };

  const format = (key: string, values?: MessageValues): string => {
    const f = formatter(key);
    if (!f) return key;
    try {
      return String(f.format(values));
    } catch {
      return key;
    }
  };

  const t = ((key: MessageKey, values?: MessageValues) => format(key, values)) as Translator;
  t.dynamic = format;
  t.has = (key) => typeof lookup(key) === "string";
  t.raw = lookup;
  t.locale = locale;
  t.rich = <R>(key: MessageKey, values?: Record<string, string | number | TagFn<R>>) => {
    const f = formatter(key);
    if (!f) return [key];
    const out = f.format<R>(values as never);
    return (Array.isArray(out) ? out : [out]) as Array<string | R>;
  };
  return t;
}
