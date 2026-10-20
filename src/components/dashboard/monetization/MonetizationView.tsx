"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useFormat } from "@/i18n/useFormat";
import type { MonetizationOverview } from "@/server/monetization/earnings";
import { AlertIcon, CheckIcon, ClockIcon, CoinsIcon, LockIcon, ShieldIcon, WalletIcon } from "../../ui/icons";
import { ColumnChart } from "../overview/ColumnChart";
import { KycDialog } from "./KycDialog";
import { Card, CardTitle, inputCls, Kpi, PayoutBadge, Segmented, Switch } from "./ui";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const data = await res.json().catch(() => ({}));
  // El servidor ya devuelve el mensaje traducido.
  if (!res.ok) throw new Error(data.details?.[0] ?? data.error ?? "");
  return data as T;
}

/** Sección «Monetización» del usuario: saldo, ganancias, tarifas, cobro e historial. */
export function MonetizationView({
  notify,
  confirm,
  isAdmin,
  onOpenAdmin,
}: {
  notify: (msg: string) => void;
  confirm: (opts: { title: string; message: string; confirmLabel: string; onConfirm: () => Promise<void> }) => void;
  isAdmin: boolean;
  onOpenAdmin: () => void;
}) {
  const t = useTranslations("monetization");
  const tm = useTranslations("payoutMethods");
  const tc = useTranslations("common");
  const tt = useTranslations("tiers");
  const { formatCount, formatDate, formatMicros, formatUsd } = useFormat();
  const [data, setData] = useState<MonetizationOverview | null>(null);
  const [metric, setMetric] = useState<"amount" | "views">("amount");
  const [method, setMethod] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);
  const errMsg = (err: unknown) => (err as Error).message || tc("requestFailed");

  const load = useCallback(async () => {
    try {
      const d = await call<MonetizationOverview>("/api/monetization");
      setData(d);
      setMethod(d.payout.method ?? d.methods[0]?.id ?? "");
      setDetails(d.payout.details ?? "");
    } catch (err) {
      notify((err as Error).message || tc("requestFailed"));
    }
  }, [notify, tc]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return <div className="py-24 text-center text-sm text-zinc-500">{t("loading")}</div>;
  }

  const methodLabel = (id: string) => (id in { PAYPAL: 1, USDT_TRC20: 1, PAYONEER: 1, BANK: 1 } ? tm(`${id as "PAYPAL"}.label`) : id);

  const toggle = async (enabled: boolean) => {
    try {
      setData(await call<MonetizationOverview>("/api/monetization", { method: "PATCH", body: JSON.stringify({ monetizationEnabled: enabled }) }));
      notify(enabled ? t("toast.enabled") : t("toast.disabled"));
    } catch (err) {
      notify(errMsg(err));
    }
  };

  const savePayout = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      setData(await call<MonetizationOverview>("/api/monetization", { method: "PATCH", body: JSON.stringify({ payoutMethod: method, payoutDetails: details }) }));
      notify(t("toast.methodSaved"));
    } catch (err) {
      notify(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const requestPayout = () => {
    // Primer cobro sin identidad verificada → se pide la verificación.
    if (data.canRequest.needsKyc) return setKycOpen(true);
    confirm({
      title: t("requestPayout"),
      message: t("confirmPayout", {
        amount: formatMicros(data.balance.availableMicros),
        method: methodLabel(data.payout.method ?? ""),
        details: data.payout.details ?? "",
      }),
      confirmLabel: t("requestPayout"),
      onConfirm: async () => {
        try {
          setData(await call<MonetizationOverview>("/api/monetization/payouts", { method: "POST" }));
          notify(t("toast.payoutRequested"));
        } catch (err) {
          notify(errMsg(err));
        }
      },
    });
  };

  const reasonText = (r: NonNullable<MonetizationOverview["canRequest"]["reason"]>) =>
    r === "belowMinimum"
      ? t("reasons.belowMinimum", { method: methodLabel(data.payout.method ?? ""), min: formatUsd(data.canRequest.minUsd ?? 0) })
      : t(`reasons.${r}`);

  const selected = data.methods.find((m) => m.id === method);
  const b = data.balance;
  const totalTierViews = data.byTier.reduce((s, x) => s + x.views, 0);
  const paidCount = data.payouts.filter((p) => p.status === "PAID").length;
  const dailyAmount = data.daily.reduce((s, d) => s + d.amountMicros, 0);
  const dailyViews = data.daily.reduce((s, d) => s + d.views, 0);

  return (
    <div className="space-y-6">
      {!data.platformEnabled && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t("platformOff")}</p>
            <p className="mt-0.5 text-amber-800">{t("platformOffHint")}</p>
          </div>
          {isAdmin && (
            <button onClick={onOpenAdmin} className="shrink-0 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-950">
              {t("configure")}
            </button>
          )}
        </div>
      )}

      {/* Saldo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          accent
          icon={<WalletIcon />}
          label={t("available")}
          value={formatMicros(b.availableMicros)}
          hint={data.canRequest.reason ? reasonText(data.canRequest.reason) : t("readyToCashOut")}
        >
          <button
            onClick={requestPayout}
            disabled={!data.canRequest.ok && !data.canRequest.needsKyc}
            className="mt-4 w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("requestPayout")}
          </button>
        </Kpi>
        <Kpi icon={<LockIcon />} label={t("held")} value={formatMicros(b.heldMicros)} hint={t("heldHint", { days: data.rules.holdDays })} />
        <Kpi icon={<CoinsIcon />} label={t("month")} value={formatMicros(b.monthMicros)} hint={t("lifetime", { amount: formatMicros(b.lifetimeMicros) })} />
        <Kpi icon={<CheckIcon />} label={t("paid")} value={formatMicros(b.paidMicros)} hint={t("paidCount", { count: paidCount })} />
      </div>

      {/* Interruptor */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">{t("monetizeTitle")}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">{t("monetizeHint")}</p>
          </div>
          <Switch checked={data.userEnabled} onChange={toggle} label={t("monetizeTitle")} />
        </div>
      </Card>

      {/* Verificación de identidad */}
      <KycCard kyc={data.kyc} onVerify={() => setKycOpen(true)} />
      <KycDialog
        open={kycOpen}
        firstPayout={data.canRequest.needsKyc}
        onClose={() => setKycOpen(false)}
        onSubmitted={() => {
          setKycOpen(false);
          notify(t("toast.kycSent"));
          void load();
        }}
      />

      {/* Gráfica */}
      <Card>
        <CardTitle
          title={metric === "amount" ? t("earningsPerDay") : t("viewsPerDay")}
          subtitle={t("last30", { value: metric === "amount" ? formatMicros(dailyAmount) : t("viewsValue", { count: dailyViews, value: formatCount(dailyViews) }) })}
          action={
            <Segmented
              label={t("metric")}
              value={metric}
              onChange={setMetric}
              options={[
                { value: "amount", label: t("earnings") },
                { value: "views", label: t("monetizedViews") },
              ]}
            />
          }
        />
        {metric === "amount" ? (
          <ColumnChart
            data={data.daily.map((d) => ({ date: d.date, value: d.amountMicros / 1e6 }))}
            label={t("earningsPerDay")}
            format={(n) => formatUsd(n)}
            integer={false}
          />
        ) : (
          <ColumnChart data={data.daily.map((d) => ({ date: d.date, value: d.views }))} unit={t("viewsUnit")} label={t("viewsPerDay")} />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Tarifas */}
        <Card className="xl:col-span-3">
          <CardTitle title={t("ratesTitle")} subtitle={t("ratesSubtitle")} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr className="border-b border-zinc-100">
                  <th className="py-2 pr-3 font-medium">{t("table.tier")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("table.rate")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("table.views")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("table.traffic")}</th>
                  <th className="py-2 text-right font-medium">{t("table.earned")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 tabular-nums">
                {data.byTier.map((x) => {
                  const countries = x.countries ? x.countries.join(", ") : tt("rest");
                  return (
                    <tr key={x.tier}>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-zinc-900">{tt("label", { n: x.tier.slice(1) })}</p>
                        <p className="max-w-[260px] truncate text-xs text-zinc-500" title={countries}>{countries}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-medium">{formatUsd(x.rateUsd)}</td>
                      <td className="py-2.5 pr-3 text-right">{formatCount(x.views)}</td>
                      <td className="py-2.5 pr-3 text-right text-zinc-500">{totalTierViews ? `${Math.round((x.views / totalTierViews) * 100)} %` : "—"}</td>
                      <td className="py-2.5 text-right font-medium">{formatMicros(x.amountMicros)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Videos que más generan */}
        <Card className="xl:col-span-2">
          <CardTitle title={t("topVideos")} subtitle={t("topVideosSubtitle")} />
          {data.topVideos.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">{t("noMonetizedViews")}</p>
          ) : (
            <ol className="space-y-3">
              {data.topVideos.map((v, i) => (
                <li key={v.id} className="flex items-center gap-3">
                  <span className="w-4 text-xs font-semibold tabular-nums text-zinc-400">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{v.title}</span>
                    <span className="mt-1 block h-1.5 rounded-full bg-zinc-100">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(v.paidViews / data.topVideos[0].paidViews) * 100}%` }} />
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{formatCount(v.paidViews)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Método de cobro */}
        <Card className="xl:col-span-2">
          <CardTitle title={t("payoutMethod")} subtitle={t("payoutMethodSubtitle")} />
          {data.methods.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("noMethods")}</p>
          ) : (
            <form onSubmit={savePayout} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {data.methods.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    aria-pressed={method === m.id}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      method === m.id ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <span className="block text-sm font-medium">{tm(`${m.id}.label`)}</span>
                    <span className="block text-xs text-zinc-500">{t("minimum", { min: formatUsd(m.minUsd) })}</span>
                  </button>
                ))}
              </div>
              {selected && (
                <label className="block text-xs font-medium text-zinc-600">
                  {tm(`${selected.id}.details`)}
                  <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder={tm(`${selected.id}.placeholder`)} className={`mt-1 ${inputCls}`} />
                </label>
              )}
              <button disabled={saving || !details.trim()} className="w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
                {saving ? tc("saving") : t("saveMethod")}
              </button>
            </form>
          )}
        </Card>

        {/* Historial */}
        <Card className="xl:col-span-3">
          <CardTitle title={t("history")} />
          {data.payouts.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">{t("noPayouts")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-xs text-zinc-500">
                  <tr className="border-b border-zinc-100">
                    <th className="py-2 pr-3 font-medium">{t("table.date")}</th>
                    <th className="py-2 pr-3 font-medium">{t("table.method")}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t("table.amount")}</th>
                    <th className="py-2 font-medium">{t("table.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 pr-3 text-zinc-600">{formatDate(p.createdAt)}</td>
                      <td className="py-2.5 pr-3">{methodLabel(p.method)}</td>
                      <td className="py-2.5 pr-3 text-right font-medium tabular-nums">{formatMicros(p.amountMicros)}</td>
                      <td className="py-2.5">
                        <PayoutBadge status={p.status} />
                        {p.reference && <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-zinc-500" title={p.reference}>{t("reference", { ref: p.reference })}</p>}
                        {p.note && <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-red-600" title={p.note}>{p.note}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Reglas */}
      <Card>
        <CardTitle title={t("rulesTitle")} />
        <ul className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
          <Rule icon={<ClockIcon />}>{t("rules.watch", { seconds: data.rules.minWatchSeconds })}</Rule>
          <Rule icon={<ShieldIcon />}>{t("rules.unique", { cap: data.rules.perIpDailyCap })}</Rule>
          <Rule icon={<AlertIcon />}>{t("rules.excluded")}</Rule>
          <Rule icon={<LockIcon />}>{t("rules.hold", { days: data.rules.holdDays })}</Rule>
        </ul>
      </Card>
    </div>
  );
}

function KycCard({ kyc, onVerify }: { kyc: MonetizationOverview["kyc"]; onVerify: () => void }) {
  const t = useTranslations("monetization.kycCard");
  const { formatRelative } = useFormat();
  const tone = {
    NONE: "bg-zinc-100 text-zinc-600",
    PENDING: "bg-amber-50 text-amber-700",
    APPROVED: "bg-emerald-50 text-emerald-700",
    REJECTED: "bg-red-50 text-red-700",
  }[kyc.status];
  const text = {
    NONE: t("noneText"),
    PENDING: t("pendingText", { when: kyc.submittedAt ? formatRelative(kyc.submittedAt) : "" }),
    APPROVED: kyc.fullName ? t("approvedTextName", { name: kyc.fullName }) : t("approvedText"),
    REJECTED: kyc.note ? t("rejectedTextReason", { reason: kyc.note }) : t("rejectedText"),
  }[kyc.status];
  const action = kyc.status === "NONE" ? t("verifyNow") : kyc.status === "REJECTED" ? t("resend") : null;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <ShieldIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">{t("title")}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{t(`status.${kyc.status}`)}</span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">{text}</p>
        </div>
        {action && (
          <button onClick={onVerify} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            {action}
          </button>
        )}
      </div>
    </Card>
  );
}

function Rule({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
      <span className="pt-1">{children}</span>
    </li>
  );
}
