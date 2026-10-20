"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const body = { ...Object.fromEntries(form), acceptTerms: form.get("acceptTerms") === "on" };
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details?.[0] ?? data.error ?? t("genericError"));
      const next = params.get("next");
      router.replace(next?.startsWith("/dashboard") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  const input =
    "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
  const link = (href: string) => (chunks: React.ReactNode) => (
    <Link href={href} target="_blank" className="font-medium text-brand-600 hover:underline">
      {chunks}
    </Link>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!isLogin && (
        <label className="block text-sm font-medium text-zinc-700">
          {t("name")} <span className="font-normal text-zinc-400">({t("optional")})</span>
          <input name="name" autoComplete="name" className={input} />
        </label>
      )}
      <label className="block text-sm font-medium text-zinc-700">
        {t("email")}
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="block text-sm font-medium text-zinc-700">
        {t("password")}
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={isLogin ? "current-password" : "new-password"}
          className={input}
        />
      </label>

      {!isLogin && (
        <label className="flex items-start gap-2.5 text-sm text-zinc-600">
          <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-4 w-4 rounded border-zinc-300" />
          <span>{t.rich("acceptTerms", { terms: link("/legal/terms"), privacy: link("/legal/privacy") })}</span>
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        disabled={loading}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {loading ? t("oneMoment") : isLogin ? t("submitLogin") : t("submitRegister")}
      </button>

      <p className="text-center text-sm text-zinc-500">
        {isLogin ? t("noAccount") : t("haveAccount")}{" "}
        <Link href={isLogin ? "/register" : "/login"} className="font-medium text-brand-600 hover:underline">
          {isLogin ? t("goRegister") : t("goLogin")}
        </Link>
      </p>
    </form>
  );
}
