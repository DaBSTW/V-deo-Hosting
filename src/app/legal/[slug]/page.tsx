import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/legal/SiteFooter";
import { isLegalSlug, LEGAL_SLUGS } from "@/components/legal/links";
import { getLegalDoc } from "@/content/legal";
import { getCoreEnv } from "@/lib/env";
import { APP_NAME } from "@/lib/brand";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isLegalSlug(slug)) return {};
  const doc = getLegalDoc((await getLocale()) as "es" | "en", slug);
  return { title: doc.title, description: doc.summary };
}

/** /legal/:slug — páginas legales en el idioma del visitante. */
export default async function LegalPage({ params }: Props) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const locale = (await getLocale()) as "es" | "en";
  const [t, tf] = await Promise.all([getTranslations("legal"), getTranslations("footer")]);
  const doc = getLegalDoc(locale, slug);
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${getCoreEnv().LEGAL_LAST_UPDATED}T00:00:00Z`),
  );

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="font-semibold tracking-tight">{APP_NAME}</Link>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">{t("backHome")}</Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={tf("legal")} className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{tf("legal")}</p>
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {LEGAL_SLUGS.map((s) => (
              <li key={s}>
                <Link
                  href={`/legal/${s}`}
                  aria-current={s === slug ? "page" : undefined}
                  className={`block rounded-lg px-3 py-1.5 text-sm transition ${
                    s === slug ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  {tf(`links.${s}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <article className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t("lastUpdated", { date: updated })}</p>
          <p className="mt-6 text-base leading-relaxed text-zinc-700">{doc.summary}</p>

          <div className="mt-8 space-y-8">
            {doc.sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-lg font-semibold text-zinc-900">{section.title}</h2>
                <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-zinc-700">
                  {section.blocks.map((b, i) =>
                    typeof b === "string" ? (
                      <p key={i}>{b}</p>
                    ) : (
                      <ul key={i} className="list-disc space-y-1.5 pl-5">
                        {b.list.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>

      <SiteFooter />
    </div>
  );
}
