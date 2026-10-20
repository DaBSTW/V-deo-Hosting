"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";
import { makeFormatters } from "@/lib/format";

/** Formateadores ligados al idioma activo (mismos nombres que antes). */
export function useFormat() {
  const locale = useLocale();
  return useMemo(() => makeFormatters(locale), [locale]);
}
