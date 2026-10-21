import { makeFormatters } from "#shared/lib/format";

/** Formateadores (números, fechas, tamaños, duración) ligados al idioma activo. */
export function useFormat() {
  const locale = useLocale();
  const f = computed(() => makeFormatters(locale.value));
  return new Proxy({} as ReturnType<typeof makeFormatters>, {
    get: (_t, key: string) => (f.value as Record<string, unknown>)[key],
  });
}
