import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t("description"),
  };
}

export const viewport: Viewport = { themeColor: "#0b0d12" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-full bg-zinc-50 font-sans text-zinc-900 antialiased">
        {/* Hereda idioma y mensajes de src/i18n/request.ts */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
