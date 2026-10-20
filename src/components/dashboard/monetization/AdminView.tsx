"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useFormat } from "@/i18n/useFormat";
import type { MonetizationSettings, PayoutMethod } from "@/server/monetization/settings";
import { AlertIcon, CoinsIcon, LockIcon, WalletIcon } from "../../ui/icons";
import type { DialogState } from "../../ui/Dialogs";
import { Card, CardTitle, inputCls, Kpi, PayoutBadge, Switch } from "./ui";

interface Summary {
  liabilityMicros: number;
  earnedTodayMicros: number;
  earnedWeekMicros: number;
  paidViewsToday: number;
  paidViewsWeek: number;
  pendingPayouts: { count: number; amountMicros: number };
  paidThisMonthMicros: number;
  topEarners: { email: string; views: number; amountMicros: number }[];
}
interface AdminPayout {
  id: string;
  email: string;
  verifiedName: string | null;
  amountMicros: number;
  method: string;
  details: string;
  status: string;
  createdAt: string;
}
interface Verification {
  id: string;
  email: string;
  payout: string | null;
  fullName: string;
  birthDate: string;
  country: string;
  documentType: string;
  documentNumber: string;
  files: ("front" | "back" | "selfie")[];
  createdAt: string;
}

const METHODS: PayoutMethod[] = ["PAYPAL", "USDT_TRC20", "PAYONEER", "BANK"];
const DOC_TYPES = ["ID_CARD", "PASSPORT", "DRIVER_LICENSE"] as const;
const ageOf = (iso: string) => {
  const b = new Date(`${iso}T00:00:00Z`);
  const n = new Date();
  return n.getUTCFullYear() - b.getUTCFullYear() - (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate()) ? 1 : 0);
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.details?.[0] ?? data.error ?? "");
  return data as T;
}

/** Panel de administración: verificaciones, pagos, ajustes de monetización y Monetag. */
export function AdminView({ notify, openDialog }: { notify: (msg: string) => void; openDialog: (d: DialogState) => void }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tm = useTranslations("payoutMethods");
  const tk = useTranslations("kyc");
  const locale = useLocale();
  const { formatCount, formatDate, formatMicros } = useFormat();
  const [settings, setSettings] = useState<MonetizationSettings | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [kyc, setKyc] = useState<Verification[]>([]);
  const [viewer, setViewer] = useState<{ src: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const errMsg = useCallback((err: unknown) => (err as Error).message || tc("requestFailed"), [tc]);

  const load = useCallback(async () => {
    try {
      const [a, p, k] = await Promise.all([
        call<{ settings: MonetizationSettings; summary: Summary }>("/api/admin/monetization"),
        call<{ payouts: AdminPayout[] }>("/api/admin/payouts"),
        call<{ verifications: Verification[] }>("/api/admin/kyc"),
      ]);
      setSettings(a.settings);
      setSummary(a.summary);
      setPayouts(p.payouts);
      setKyc(k.verifications);
      setDirty(false);
    } catch (err) {
      notify(errMsg(err));
    }
  }, [notify, errMsg]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings || !summary) return <div className="py-24 text-center text-sm text-zinc-500">{tc("loading")}</div>;

  const set = <K extends keyof MonetizationSettings>(k: K, v: MonetizationSettings[K]) => {
    setSettings({ ...settings, [k]: v });
    setDirty(true);
  };
  const refreshSummary = () =>
    void call<{ settings: MonetizationSettings; summary: Summary }>("/api/admin/monetization").then((a) => setSummary(a.summary));

  const save = async () => {
    setSaving(true);
    try {
      const r = await call<{ settings: MonetizationSettings; summary: Summary }>("/api/admin/monetization", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(r.settings);
      setSummary(r.summary);
      setDirty(false);
      notify(t("toast.saved"));
    } catch (err) {
      notify(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const act = async (p: AdminPayout, action: "approve" | "pay" | "reject", extra: { reference?: string; note?: string } = {}) => {
    try {
      const r = await call<{ payouts: AdminPayout[] }>(`/api/admin/payouts/${p.id}`, { method: "PATCH", body: JSON.stringify({ action, ...extra }) });
      setPayouts(r.payouts);
      notify(t(`toast.payout_${action}`));
      refreshSummary();
      return true;
    } catch (err) {
      notify(errMsg(err));
      return false;
    }
  };

  const review = async (v: Verification, action: "approve" | "reject", note?: string) => {
    try {
      const r = await call<{ verifications: Verification[] }>(`/api/admin/kyc/${v.id}`, { method: "PATCH", body: JSON.stringify({ action, note }) });
      setKyc(r.verifications);
      notify(action === "approve" ? t("toast.kycApproved", { name: v.fullName }) : t("toast.kycRejected"));
      void call<{ payouts: AdminPayout[] }>("/api/admin/payouts").then((x) => setPayouts(x.payouts));
      return true;
    } catch (err) {
      notify(errMsg(err));
      return false;
    }
  };

  const regionName = (c: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" }).of(c) ?? c;
    } catch {
      return c;
    }
  };
  const docLabel = (d: string) => ((DOC_TYPES as readonly string[]).includes(d) ? tk(`documentTypes.${d as "ID_CARD"}`) : d);
  const methodLabel = (m: string) => ((METHODS as string[]).includes(m) ? tm(`${m as PayoutMethod}.label`) : m);
  const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi accent icon={<WalletIcon />} label={t("liability")} value={formatMicros(summary.liabilityMicros)} hint={t("liabilityHint")} />
        <Kpi icon={<AlertIcon />} label={t("pendingPayouts")} value={formatMicros(summary.pendingPayouts.amountMicros)} hint={t("requests", { count: summary.pendingPayouts.count })} />
        <Kpi
          icon={<CoinsIcon />}
          label={t("earnedWeek")}
          value={formatMicros(summary.earnedWeekMicros)}
          hint={t("earnedWeekHint", { today: formatMicros(summary.earnedTodayMicros), views: formatCount(summary.paidViewsWeek) })}
        />
        <Kpi icon={<LockIcon />} label={t("paidMonth")} value={formatMicros(summary.paidThisMonthMicros)} />
      </div>

      {/* Verificaciones de identidad */}
      <Card>
        <CardTitle title={t("kycTitle")} subtitle={t("kycSubtitle")} />
        {kyc.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">{t("kycEmpty")}</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {kyc.map((v) => (
              <li key={v.id} className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{v.fullName}</p>
                  <p className="text-xs text-zinc-500">{t("submitted", { email: v.email, date: formatDate(v.createdAt) })}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <div><dt className="text-zinc-400">{t("birth")}</dt><dd>{t("age", { date: v.birthDate, age: ageOf(v.birthDate) })}</dd></div>
                    <div><dt className="text-zinc-400">{t("country")}</dt><dd>{regionName(v.country)}</dd></div>
                    <div><dt className="text-zinc-400">{docLabel(v.documentType)}</dt><dd className="font-mono">{v.documentNumber}</dd></div>
                    <div><dt className="text-zinc-400">{t("payout")}</dt><dd className="truncate" title={v.payout ?? ""}>{v.payout ?? "—"}</dd></div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {v.files.map((f) => {
                      const src = `/api/admin/kyc/${v.id}/file/${f}`;
                      const label = t(`files.${f}`);
                      return (
                        <button
                          key={f}
                          onClick={() => setViewer({ src, title: `${v.fullName} · ${label}` })}
                          className="group relative h-20 w-28 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200"
                          title={t("enlarge")}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={label} className="h-full w-full object-cover transition group-hover:scale-105" />
                          <span className="absolute bottom-1 left-1 rounded bg-zinc-900/80 px-1 text-[10px] text-white">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-start gap-2 lg:flex-col lg:items-stretch">
                  <button onClick={() => review(v, "approve")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                    {t("approve")}
                  </button>
                  <button
                    onClick={() =>
                      openDialog({
                        kind: "prompt",
                        title: t("kycRejectTitle", { name: v.fullName }),
                        label: t("kycRejectLabel"),
                        confirmLabel: t("reject"),
                        onSubmit: (note) => review(v, "reject", note),
                      })
                    }
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50"
                  >
                    {t("reject")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-6" onClick={() => setViewer(null)} role="dialog" aria-label={viewer.title}>
          <figure className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewer.src} alt={viewer.title} className="max-h-[80vh] rounded-xl object-contain" />
            <figcaption className="mt-2 flex items-center justify-between text-sm text-white">
              {viewer.title}
              <button onClick={() => setViewer(null)} className="rounded-lg px-3 py-1 hover:bg-white/10">{tc("close")}</button>
            </figcaption>
          </figure>
        </div>
      )}

      {/* Cola de pagos */}
      <Card>
        <CardTitle title={t("pendingPayouts")} subtitle={t("payoutsSubtitle")} />
        {payouts.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">{t("payoutsEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr className="border-b border-zinc-100">
                  <th className="py-2 pr-3 font-medium">{t("table.user")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("table.amount")}</th>
                  <th className="py-2 pr-3 font-medium">{t("table.destination")}</th>
                  <th className="py-2 pr-3 font-medium">{t("table.requested")}</th>
                  <th className="py-2 pr-3 font-medium">{t("table.status")}</th>
                  <th className="py-2 text-right font-medium">{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{p.email}</p>
                      {p.verifiedName ? (
                        <p className="text-xs text-emerald-700">✓ {p.verifiedName}</p>
                      ) : (
                        <p className="text-xs text-red-600">{t("notVerified")}</p>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{formatMicros(p.amountMicros)}</td>
                    <td className="py-2.5 pr-3">
                      <p>{methodLabel(p.method)}</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(p.details).then(() => notify(t("toast.destinationCopied")))}
                        className="max-w-[240px] truncate font-mono text-xs text-zinc-500 hover:text-zinc-800"
                        title={tc("copy")}
                      >
                        {p.details}
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 text-zinc-600">{formatDate(p.createdAt)}</td>
                    <td className="py-2.5 pr-3"><PayoutBadge status={p.status} /></td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {p.status === "PENDING" && p.verifiedName && (
                          <button onClick={() => act(p, "approve")} className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50">
                            {t("approve")}
                          </button>
                        )}
                        <button
                          disabled={!p.verifiedName}
                          onClick={() =>
                            openDialog({
                              kind: "prompt",
                              title: t("markPaidTitle", { amount: formatMicros(p.amountMicros) }),
                              label: t("referenceLabel"),
                              confirmLabel: t("markPaid"),
                              onSubmit: (reference) => act(p, "pay", { reference }),
                            })
                          }
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t("paidButton")}
                        </button>
                        <button
                          onClick={() =>
                            openDialog({
                              kind: "prompt",
                              title: t("rejectPayoutTitle"),
                              label: t("rejectPayoutLabel"),
                              confirmLabel: t("reject"),
                              onSubmit: (note) => act(p, "reject", { note }),
                            })
                          }
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          {t("reject")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Ajustes */}
      <Card>
        <CardTitle
          title={t("settingsTitle")}
          subtitle={t("settingsSubtitle")}
          action={
            <button onClick={save} disabled={!dirty || saving} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? tc("saving") : dirty ? t("saveChanges") : t("saved")}
            </button>
          }
        />

        <div className="flex items-center justify-between gap-4 rounded-xl bg-zinc-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium">{t("active")}</p>
            <p className="text-xs text-zinc-500">{t("activeHint")}</p>
          </div>
          <Switch checked={settings.enabled} onChange={(v) => set("enabled", v)} label={t("active")} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{t("ratesLegend")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["T1", "T2", "T3"] as const).map((tier) => (
                <label key={tier} className="text-xs font-medium text-zinc-600">
                  {t("tier", { n: tier.slice(1) })}
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={settings.rates[tier]}
                    onChange={(e) => set("rates", { ...settings.rates, [tier]: num(e.target.value) })}
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{t("antifraudLegend")}</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs font-medium text-zinc-600">
                {t("minSeconds")}
                <input type="number" min={5} value={settings.minWatchSeconds} onChange={(e) => set("minWatchSeconds", num(e.target.value))} className={`mt-1 ${inputCls}`} />
              </label>
              <label className="text-xs font-medium text-zinc-600">
                {t("holdDays")}
                <input type="number" min={0} value={settings.holdDays} onChange={(e) => set("holdDays", num(e.target.value))} className={`mt-1 ${inputCls}`} />
              </label>
              <label className="text-xs font-medium text-zinc-600">
                {t("ipCap")}
                <input type="number" min={1} value={settings.perIpDailyCap} onChange={(e) => set("perIpDailyCap", num(e.target.value))} className={`mt-1 ${inputCls}`} />
              </label>
            </div>
          </fieldset>
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">{t("methodsLegend")}</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {METHODS.map((m) => {
              const cfg = settings.payoutMethods[m] ?? { enabled: false, minUsd: 25 };
              return (
                <div key={m} className="rounded-xl border border-zinc-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{tm(`${m}.label`)}</span>
                    <Switch checked={cfg.enabled} onChange={(v) => set("payoutMethods", { ...settings.payoutMethods, [m]: { ...cfg, enabled: v } })} label={tm(`${m}.label`)} />
                  </div>
                  <label className="mt-2 block text-xs text-zinc-500">
                    {t("minimumUsd")}
                    <input
                      type="number"
                      min={25}
                      value={cfg.minUsd}
                      onChange={(e) => set("payoutMethods", { ...settings.payoutMethods, [m]: { ...cfg, minUsd: num(e.target.value) } })}
                      className={`mt-1 ${inputCls}`}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>
      </Card>

      {/* Monetag */}
      <Card>
        <CardTitle title="Monetag" subtitle={t("monetagSubtitle")} />
        <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm text-zinc-600">
          <li>{t("monetagStep1")}</li>
          <li>{t.rich("monetagStep2", { meta: "<meta>", code: (c) => <code className="rounded bg-zinc-100 px-1">{c}</code> })}</li>
          <li>{t("monetagStep3")}</li>
          <li>{t("monetagStep4")}</li>
        </ol>
        <div className="space-y-4">
          <label className="block text-xs font-medium text-zinc-600">
            {t("monetagMeta", { tag: "<meta …>" })}
            <input value={settings.monetagMetaTag} onChange={(e) => set("monetagMetaTag", e.target.value)} placeholder='<meta name="monetag" content="…">' className={`mt-1 font-mono text-xs ${inputCls}`} />
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            {t("monetagSnippet")}
            <textarea rows={5} value={settings.monetagPlayerSnippet} onChange={(e) => set("monetagPlayerSnippet", e.target.value)} placeholder="<script>…</script>" className={`mt-1 font-mono text-xs ${inputCls}`} />
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            {t("monetagSw")}
            <textarea rows={3} value={settings.monetagServiceWorker} onChange={(e) => set("monetagServiceWorker", e.target.value)} placeholder="self.options = { … }; importScripts(…)" className={`mt-1 font-mono text-xs ${inputCls}`} />
          </label>
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("monetagWarning")}
          </p>
        </div>
      </Card>

      {/* Revisión antifraude */}
      <Card>
        <CardTitle title={t("topEarners")} subtitle={t("topEarnersSubtitle")} />
        {summary.topEarners.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">{t("noActivity")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr className="border-b border-zinc-100">
                <th className="py-2 font-medium">{t("table.user")}</th>
                <th className="py-2 text-right font-medium">{t("table.monetizedViews")}</th>
                <th className="py-2 text-right font-medium">{t("table.generated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 tabular-nums">
              {summary.topEarners.map((x) => (
                <tr key={x.email}>
                  <td className="py-2">{x.email}</td>
                  <td className="py-2 text-right">{formatCount(x.views)}</td>
                  <td className="py-2 text-right font-medium">{formatMicros(x.amountMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
