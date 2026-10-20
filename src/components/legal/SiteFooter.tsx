import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/brand";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LEGAL_SLUGS } from "./links";

/** Footer con las páginas legales y el selector de idioma. */
export async function SiteFooter({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  const t = await getTranslations("footer");
  const year = new Date().getFullYear();
  return (
    <footer className={`border-t ${dark ? "border-white/10 bg-zinc-950 text-zinc-400" : "border-zinc-200 bg-white/60 text-zinc-500"}`}>
      <div className={`mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:px-6 ${compact ? "py-4" : "py-8"}`}>
        <nav aria-label={t("legal")} className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          {LEGAL_SLUGS.map((slug) => (
            <Link key={slug} href={`/legal/${slug}`} className={`hover:underline ${dark ? "hover:text-zinc-200" : "hover:text-zinc-800"}`}>
              {t(`links.${slug}`)}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <p>{t("rights", { year, app: APP_NAME })}</p>
          <LanguageSwitcher dark={dark} />
        </div>
      </div>
    </footer>
  );
}
