import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/legal/SiteFooter";
import { APP_NAME } from "@/lib/brand";
import { getSessionUser } from "@/server/auth/session";
import { getMonetizationSettings, parseMetaTag } from "@/server/monetization/settings";

/** Etiqueta <meta> de verificación de Monetag (se pega en el panel de administración). */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const meta = parseMetaTag((await getMonetizationSettings()).monetagMetaTag);
    return meta ? { other: { [meta.name]: meta.content } } : {};
  } catch {
    return {};
  }
}

export default async function Home() {
  const [user, t] = await Promise.all([getSessionUser(), getTranslations("landing")]);
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">{APP_NAME}</span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 max-w-xl text-zinc-600">{t("subtitle")}</p>
        <div className="mt-8 flex gap-3">
          {user ? (
            <Link href="/dashboard" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
              {t("goToVideos")}
            </Link>
          ) : (
            <>
              <Link href="/register" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
                {t("createAccount")}
              </Link>
              <Link href="/login" className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-zinc-100">
                {t("signIn")}
              </Link>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
