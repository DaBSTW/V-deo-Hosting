"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl bg-white p-5 ring-1 ring-zinc-200/80 ${className}`}>{children}</section>;
}

export function CardTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Kpi({
  icon, label, value, hint, accent, children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: ReactNode;
  accent?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl p-5 ring-1 ${
        accent ? "bg-gradient-to-br from-brand-600 to-brand-700 text-white ring-brand-700" : "bg-white ring-zinc-200/80"
      }`}
    >
      <div className={`flex items-center gap-2 text-sm ${accent ? "text-white/80" : "text-zinc-500"}`}>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${accent ? "bg-white/15" : "bg-zinc-100 text-zinc-500"}`}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className={`mt-1 text-xs ${accent ? "text-white/75" : "text-zinc-500"}`}>{hint}</p>}
      {children}
    </section>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? "bg-brand-600" : "bg-zinc-300"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function Segmented<T extends string | number>({
  label, value, onChange, options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-white p-1 ring-1 ring-zinc-200">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            value === o.value ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-brand-50 text-brand-700",
  PAID: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

export function PayoutBadge({ status }: { status: string }) {
  const t = useTranslations("payoutStatus");
  const known = status in STATUS_CLS;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[status] ?? "bg-zinc-100 text-zinc-600"}`}>
      {known ? t(status as "PENDING") : status}
    </span>
  );
}

export const inputCls =
  "block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
