"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { LOCALES, LOCALE_COOKIE, type AppLocale } from "@/i18n/config";

/** Cambia el idioma guardando la preferencia en una cookie (las URLs no cambian). */
export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  const change = (next: AppLocale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    start(() => router.refresh());
  };

  return (
    <label className={`inline-flex items-center gap-2 text-xs ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
      <span aria-hidden>🌐</span>
      <span className="sr-only">{t("label")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => change(e.target.value as AppLocale)}
        className={`rounded-lg border px-2 py-1 text-xs outline-none ${
          dark ? "border-white/10 bg-zinc-900 text-zinc-200" : "border-zinc-200 bg-white text-zinc-700"
        }`}
        aria-label={t("label")}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(l)}
          </option>
        ))}
      </select>
    </label>
  );
}
