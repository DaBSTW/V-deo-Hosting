import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { HeroMockup } from "@/components/home/HeroMockup";
import { SiteFooter } from "@/components/legal/SiteFooter";
import {
  ChartIcon,
  CheckIcon,
  CodeIcon,
  DownloadIcon,
  FolderIcon,
  LockIcon,
  PlayIcon,
  ShieldIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { APP_NAME } from "@/lib/brand";
import { getCoreEnv } from "@/lib/env";
import { makeFormatters } from "@/lib/format";
import { getSessionUser } from "@/server/auth/session";
import {
  DEFAULT_SETTINGS,
  MIN_PAYOUT_USD,
  getMonetizationSettings,
  parseMetaTag,
  type MonetizationSettings,
} from "@/server/monetization/settings";

/** Los ajustes viven en la BD; si no está disponible, la portada se muestra igual. */
async function loadSettings(): Promise<MonetizationSettings> {
  try {
    return await getMonetizationSettings();
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Título de la portada + etiqueta <meta> de verificación de Monetag (se pega en el panel de administración). */
export async function generateMetadata(): Promise<Metadata> {
  const [settings, t] = await Promise.all([loadSettings(), getTranslations("landing")]);
  const meta = parseMetaTag(settings.monetagMetaTag);
  return {
    title: `${APP_NAME} · ${t("metaTitle")}`,
    ...(meta ? { other: { [meta.name]: meta.content } } : {}),
  };
}

const FEATURES = [
  { key: "upload", icon: UploadIcon },
  { key: "player", icon: PlayIcon },
  { key: "embed", icon: CodeIcon },
  { key: "library", icon: FolderIcon },
  { key: "stats", icon: ChartIcon },
  { key: "downloads", icon: DownloadIcon },
] as const;

const TIERS = ["T1", "T2", "T3"] as const;
const FAQ = [1, 2, 3, 4, 5, 6] as const;

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
const textLink = "font-medium text-brand-600 underline-offset-2 hover:underline";

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-brand-600">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-4 text-zinc-600">{subtitle}</p>}
    </div>
  );
}

function Point({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          dark ? "bg-brand-500/20 text-brand-300" : "bg-brand-50 text-brand-600"
        }`}
      >
        <CheckIcon className="h-3 w-3" />
      </span>
      <span>{children}</span>
    </li>
  );
}

export default async function Home() {
  const [user, t, locale, settings] = await Promise.all([
    getSessionUser(),
    getTranslations("landing"),
    getLocale(),
    loadSettings(),
  ]);
  const fmt = makeFormatters(locale);
  const { APP_URL, MAX_UPLOAD_MB } = getCoreEnv();
  const minPayout = fmt.formatUsd(MIN_PAYOUT_USD);
  const embedSrc = `${APP_URL.replace(/\/$/, "")}/embed/v_8fK2pQx7`;

  const nav = [
    { href: "#features", label: t("nav.features") },
    { href: "#how", label: t("nav.howItWorks") },
    { href: "#monetization", label: t("nav.monetization") },
    { href: "#faq", label: t("nav.faq") },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* ── Cabecera ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <PlayIcon className="ml-0.5 h-4 w-4" />
            </span>
            {APP_NAME}
          </Link>
          <nav aria-label={t("nav.menu")} className="hidden flex-1 items-center gap-6 text-sm text-zinc-400 md:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-white">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 whitespace-nowrap text-sm sm:gap-2">
            {user ? (
              <Link href="/dashboard" className={btnPrimary}>
                {t("nav.dashboard")}
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-lg px-2.5 py-2 font-medium text-zinc-300 transition hover:text-white">
                  {t("nav.signIn")}
                </Link>
                <Link href="/register" className={`${btnPrimary} px-3 py-2 sm:px-4`}>
                  {t("nav.createAccount")}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ───────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-zinc-950 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_0%,rgba(79,110,247,0.3),transparent)]" />
          <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-2 lg:pb-32 lg:pt-24">
            <div className="min-w-0">
              <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
                {t("hero.badge")}
              </span>
              <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                {t.rich("hero.title", {
                  accent: (chunks) => (
                    <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">{chunks}</span>
                  ),
                })}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">{t("hero.subtitle")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={user ? "/dashboard" : "/register"} className={`${btnPrimary} px-6 py-3 text-base`}>
                  {user ? t("cta.dashboard") : t("hero.primary")}
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center rounded-lg border border-white/15 px-6 py-3 text-base font-medium text-zinc-200 transition hover:bg-white/5"
                >
                  {t("hero.secondary")}
                </a>
              </div>
              <p className="mt-5 text-sm text-zinc-500">{t("hero.note")}</p>
            </div>
            <HeroMockup
              labels={{
                uploading: t("mockup.uploading"),
                ready: t("mockup.ready"),
                copyIframe: t("mockup.copyIframe"),
                views: t("mockup.views"),
                monetized: t("mockup.monetized"),
              }}
            />
          </div>
        </section>

        {/* ── Franja de puntos fuertes ───────────────────────────── */}
        <section className="border-b border-zinc-200 bg-zinc-50">
          <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-4 px-4 py-6 text-sm font-medium text-zinc-700 sm:px-6 md:grid-cols-4">
            {[
              { icon: ShieldIcon, label: t("highlights.noWatermark") },
              { icon: PlayIcon, label: t("highlights.adaptive") },
              { icon: LockIcon, label: t("highlights.signed") },
              { icon: CheckIcon, label: t("highlights.bilingual") },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center justify-center gap-2 text-center">
                <Icon className="h-4 w-4 shrink-0 text-brand-600" />
                {label}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Funciones ──────────────────────────────────────────── */}
        <section id="features" className="scroll-mt-16 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow={t("features.eyebrow")} title={t("features.title")} subtitle={t("features.subtitle")} />
            <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ key, icon: Icon }) => (
                <div key={key} className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-brand-200 hover:shadow-sm">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold text-zinc-900">{t(`features.${key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(`features.${key}.text`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Cómo funciona ──────────────────────────────────────── */}
        <section id="how" className="scroll-mt-16 bg-zinc-50 py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow={t("how.eyebrow")} title={t("how.title")} />
            <ol className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
              {(["step1", "step2", "step3"] as const).map((step, i) => (
                <li key={step} className="relative rounded-2xl border border-zinc-200 bg-white p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-zinc-900">{t(`how.${step}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(`how.${step}.text`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Inserción ──────────────────────────────────────────── */}
        <section className="py-24">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand-600">{t("embed.eyebrow")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">{t("embed.title")}</h2>
              <p className="mt-4 text-zinc-600">{t("embed.text")}</p>
              <ul className="mt-6 space-y-3 text-sm text-zinc-700">
                <Point>{t("embed.point1")}</Point>
                <Point>{t("embed.point2")}</Point>
                <Point>{t("embed.point3")}</Point>
              </ul>
            </div>
            <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-xs text-zinc-500">
                <CodeIcon className="h-4 w-4" />
                embed.html
              </div>
              <pre className="whitespace-pre-wrap break-all p-5 text-[13px] leading-relaxed text-zinc-300">
                <code>
                  <span className="text-zinc-500">{'<div style="position:relative;padding-top:56.25%">'}</span>
                  {"\n  "}
                  <span className="text-brand-300">{"<iframe"}</span>
                  {"\n    "}
                  <span className="text-sky-300">src</span>=<span className="text-emerald-300">{`"${embedSrc}"`}</span>
                  {"\n    "}
                  <span className="text-sky-300">loading</span>=<span className="text-emerald-300">{'"lazy"'}</span>
                  {"\n    "}
                  <span className="text-sky-300">allow</span>=<span className="text-emerald-300">{'"autoplay; fullscreen; picture-in-picture"'}</span>
                  {"\n    "}
                  <span className="text-sky-300">allowfullscreen</span>
                  {"\n    "}
                  <span className="text-sky-300">style</span>=<span className="text-emerald-300">{'"position:absolute;inset:0;width:100%;height:100%;border:0"'}</span>
                  <span className="text-brand-300">{"></iframe>"}</span>
                  {"\n"}
                  <span className="text-zinc-500">{"</div>"}</span>
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* ── Monetización ───────────────────────────────────────── */}
        <section id="monetization" className="scroll-mt-16 bg-zinc-950 py-24 text-white">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand-400">{t("monetization.eyebrow")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t("monetization.title")}</h2>
              <p className="mt-4 text-zinc-400">{t("monetization.text")}</p>
              <ul className="mt-6 space-y-3 text-sm text-zinc-300">
                <Point dark>{t("monetization.point1", { min: minPayout })}</Point>
                <Point dark>{t("monetization.point2")}</Point>
                <Point dark>{t("monetization.point3")}</Point>
                <Point dark>{t("monetization.point4")}</Point>
              </ul>
              <p className="mt-6 text-sm text-zinc-500">
                {t.rich("monetization.terms", {
                  link: (chunks) => (
                    <Link href="/legal/monetization" className="text-zinc-300 underline-offset-2 hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h3 className="font-semibold">{t("monetization.ratesTitle")}</h3>
              {settings.enabled ? (
                <>
                  <ul className="mt-5 divide-y divide-white/10">
                    {TIERS.map((tier, i) => (
                      <li key={tier} className="flex items-center justify-between gap-4 py-4">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{t("monetization.tier", { n: i + 1 })}</div>
                          <div className="mt-0.5 text-xs text-zinc-500">{t(`monetization.tierCountries.${tier}`)}</div>
                        </div>
                        <div className="shrink-0 text-2xl font-semibold tabular-nums text-brand-300">
                          {fmt.formatUsd(settings.rates[tier])}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-zinc-500">{t("monetization.ratesHint")}</p>
                </>
              ) : (
                <p className="mt-4 text-sm text-zinc-400">{t("monetization.ratesHidden")}</p>
              )}
            </div>
          </div>
        </section>

        {/* ── Preguntas frecuentes ───────────────────────────────── */}
        <section id="faq" className="scroll-mt-16 py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeading eyebrow={t("faq.eyebrow")} title={t("faq.title")} />
            <div className="mt-12 divide-y divide-zinc-200 rounded-2xl border border-zinc-200">
              {FAQ.map((n) => (
                <details key={n} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium text-zinc-900">
                    {t(`faq.q${n}`)}
                    <span className="text-xl leading-none text-zinc-400 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-600">
                    {n === 2
                      ? t("faq.a2", { max: fmt.formatBytes(MAX_UPLOAD_MB * 1024 * 1024) })
                      : n === 3
                        ? t("faq.a3", { seconds: settings.minWatchSeconds })
                        : n === 4
                          ? t("faq.a4", { min: minPayout })
                          : n === 6
                            ? t.rich("faq.a6", {
                                link: (chunks) => (
                                  <Link href="/legal/acceptable-use" className={textLink}>
                                    {chunks}
                                  </Link>
                                ),
                              })
                            : t(`faq.a${n}`)}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Llamada final ──────────────────────────────────────── */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand-600 px-6 py-16 text-center text-white">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,rgba(255,255,255,0.2),transparent)]" />
            <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">{t("cta.title")}</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-brand-100">{t("cta.text")}</p>
            <Link
              href={user ? "/dashboard" : "/register"}
              className="relative mt-8 inline-flex rounded-lg bg-white px-6 py-3 font-medium text-brand-700 shadow-sm transition hover:bg-brand-50"
            >
              {user ? t("cta.dashboard") : t("cta.button")}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
