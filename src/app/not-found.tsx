import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-black px-6 text-center">
      <p className="text-sm font-medium text-zinc-300">{t("title")}</p>
      <p className="text-sm text-zinc-500">{t("text")}</p>
    </main>
  );
}
