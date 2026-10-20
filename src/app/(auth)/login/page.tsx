import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth"))("loginTitle") };
}

export default async function Page() {
  const t = await getTranslations("auth");
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">{t("loginTitle")}</h1>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
