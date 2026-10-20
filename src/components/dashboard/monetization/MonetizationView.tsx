"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatCount, formatDate, formatMicros, formatUsd } from "@/lib/format";
import type { MonetizationOverview } from "@/server/monetization/earnings";
import { AlertIcon, CheckIcon, ClockIcon, CoinsIcon, LockIcon, ShieldIcon, WalletIcon } from "../../ui/icons";
import { ColumnChart } from "../overview/ColumnChart";
import { Card, CardTitle, inputCls, Kpi, PayoutBadge, Segmented, Switch } from "./ui";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.details?.[0] ?? data.error ?? "No se pudo completar la operación");
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
  const [data, setData] = useState<MonetizationOverview | null>(null);
  const [metric, setMetric] = useState<"amount" | "views">("amount");
  const [method, setMethod] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await call<MonetizationOverview>("/api/monetization");
      setData(d);
      setMethod(d.payout.method ?? d.methods[0]?.id ?? "");
      setDetails(d.payout.details ?? "");
    } catch (err) {
      notify((err as Error).message);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return <div className="py-24 text-center text-sm text-zinc-500">Cargando monetización…</div>;
  }

  const toggle = async (enabled: boolean) => {
    try {
      setData(await call<MonetizationOverview>("/api/monetization", { method: "PATCH", body: JSON.stringify({ monetizationEnabled: enabled }) }));
      notify(enabled ? "Monetización activada en tus videos" : "Monetización desactivada: tus videos no mostrarán anuncios");
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const savePayout = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      setData(await call<MonetizationOverview>("/api/monetization", { method: "PATCH", body: JSON.stringify({ payoutMethod: method, payoutDetails: details }) }));
      notify("Método de cobro guardado");
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const requestPayout = () =>
    confirm({
      title: "Solicitar pago",
      message: `Vas a solicitar el cobro de ${formatMicros(data.balance.availableMicros)} mediante ${
        data.methods.find((m) => m.id === data.payout.method)?.label ?? data.payout.method
      } (${data.payout.details}). Lo revisaremos y te avisaremos cuando esté enviado.`,
      confirmLabel: "Solicitar pago",
      onConfirm: async () => {
        try {
          setData(await call<MonetizationOverview>("/api/monetization/payouts", { method: "POST" }));
          notify("Pago solicitado");
        } catch (err) {
          notify((err as Error).message);
        }
      },
    });

  const selected = data.methods.find((m) => m.id === method);
  const b = data.balance;
  const totalTierViews = data.byTier.reduce((s, t) => s + t.views, 0);

  return (
    <div className="space-y-6">
      {!data.platformEnabled && (
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">La monetización aún no está activa en la plataforma.</p>
            <p className="mt-0.5 text-amber-800">Tus reproducciones se siguen contando, pero todavía no generan ganancias.</p>
          </div>
          {isAdmin && (
            <button onClick={onOpenAdmin} className="shrink-0 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-950">
              Configurar
            </button>
          )}
        </div>
      )}

      {/* Saldo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi accent icon={<WalletIcon />} label="Saldo disponible" value={formatMicros(b.availableMicros)} hint={data.canRequest.ok ? "Listo para cobrar" : data.canRequest.reason}>
          <button
            onClick={requestPayout}
            disabled={!data.canRequest.ok}
            className="mt-4 w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Solicitar pago
          </button>
        </Kpi>
        <Kpi icon={<LockIcon />} label="En revisión" value={formatMicros(b.heldMicros)} hint={`Se libera a los ${data.rules.holdDays} días (antifraude)`} />
        <Kpi icon={<CoinsIcon />} label="Ganado este mes" value={formatMicros(b.monthMicros)} hint={`${formatMicros(b.lifetimeMicros)} desde el inicio`} />
        <Kpi icon={<CheckIcon />} label="Total cobrado" value={formatMicros(b.paidMicros)} hint={(() => { const n = data.payouts.filter((p) => p.status === "PAID").length; return `${n} ${n === 1 ? "pago realizado" : "pagos realizados"}`; })()} />
      </div>

      {/* Interruptor */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Monetizar mis videos</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Se mostrarán anuncios en tu reproductor y en tus enlaces, y ganarás por cada vista monetizada. Desactívalo para que tus videos no tengan anuncios (no generarán ganancias).
            </p>
          </div>
          <Switch checked={data.userEnabled} onChange={toggle} label="Monetizar mis videos" />
        </div>
      </Card>

      {/* Gráfica */}
      <Card>
        <CardTitle
          title={metric === "amount" ? "Ganancias por día" : "Vistas monetizadas por día"}
          subtitle={`Últimos 30 días · ${
            metric === "amount"
              ? formatMicros(data.daily.reduce((s, d) => s + d.amountMicros, 0))
              : `${formatCount(data.daily.reduce((s, d) => s + d.views, 0))} vistas`
          }`}
          action={
            <Segmented
              label="Métrica"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "amount", label: "Ganancias" },
                { value: "views", label: "Vistas monetizadas" },
              ]}
            />
          }
        />
        {metric === "amount" ? (
          <ColumnChart
            data={data.daily.map((d) => ({ date: d.date, value: d.amountMicros / 1e6 }))}
            label="Ganancias por día, últimos 30 días"
            format={(n) => formatUsd(n)}
            integer={false}
          />
        ) : (
          <ColumnChart data={data.daily.map((d) => ({ date: d.date, value: d.views }))} unit="vistas" label="Vistas monetizadas por día, últimos 30 días" />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Tarifas */}
        <Card className="xl:col-span-3">
          <CardTitle title="Tarifas y ganancias por país" subtitle="Pago por cada 1.000 vistas monetizadas · últimos 30 días" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr className="border-b border-zinc-100">
                  <th className="py-2 pr-3 font-medium">Nivel</th>
                  <th className="py-2 pr-3 text-right font-medium">Tarifa / 1.000</th>
                  <th className="py-2 pr-3 text-right font-medium">Vistas</th>
                  <th className="py-2 pr-3 text-right font-medium">% tráfico</th>
                  <th className="py-2 text-right font-medium">Ganado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 tabular-nums">
                {data.byTier.map((t) => (
                  <tr key={t.tier}>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-zinc-900">{t.label}</p>
                      <p className="max-w-[260px] truncate text-xs text-zinc-500" title={t.countries}>{t.countries}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium">{formatUsd(t.rateUsd)}</td>
                    <td className="py-2.5 pr-3 text-right">{formatCount(t.views)}</td>
                    <td className="py-2.5 pr-3 text-right text-zinc-500">{totalTierViews ? `${Math.round((t.views / totalTierViews) * 100)} %` : "—"}</td>
                    <td className="py-2.5 text-right font-medium">{formatMicros(t.amountMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Videos que más generan */}
        <Card className="xl:col-span-2">
          <CardTitle title="Videos que más generan" subtitle="Vistas monetizadas · últimos 30 días" />
          {data.topVideos.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">Aún no hay vistas monetizadas.</p>
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
          <CardTitle title="Método de cobro" subtitle="Dónde quieres recibir tus pagos" />
          {data.methods.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay métodos de cobro disponibles por ahora.</p>
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
                    <span className="block text-sm font-medium">{m.label}</span>
                    <span className="block text-xs text-zinc-500">Mínimo {formatUsd(m.minUsd)}</span>
                  </button>
                ))}
              </div>
              {selected && (
                <label className="block text-xs font-medium text-zinc-600">
                  {selected.detailsLabel}
                  <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder={selected.placeholder} className={`mt-1 ${inputCls}`} />
                </label>
              )}
              <button disabled={saving || !details.trim()} className="w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar método de cobro"}
              </button>
            </form>
          )}
        </Card>

        {/* Historial */}
        <Card className="xl:col-span-3">
          <CardTitle title="Historial de pagos" />
          {data.payouts.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">Todavía no has solicitado ningún pago.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-xs text-zinc-500">
                  <tr className="border-b border-zinc-100">
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 font-medium">Método</th>
                    <th className="py-2 pr-3 text-right font-medium">Importe</th>
                    <th className="py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.payouts.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 pr-3 text-zinc-600">{formatDate(p.createdAt)}</td>
                      <td className="py-2.5 pr-3">{data.methods.find((m) => m.id === p.method)?.label ?? p.method}</td>
                      <td className="py-2.5 pr-3 text-right font-medium tabular-nums">{formatMicros(p.amountMicros)}</td>
                      <td className="py-2.5">
                        <PayoutBadge status={p.status} />
                        {p.reference && <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-zinc-500" title={p.reference}>Ref: {p.reference}</p>}
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
        <CardTitle title="¿Qué cuenta como vista monetizada?" />
        <ul className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
          <Rule icon={<ClockIcon />}>El espectador reproduce al menos {data.rules.minWatchSeconds} segundos (o la mitad, si el video es más corto).</Rule>
          <Rule icon={<ShieldIcon />}>Una vista por persona y video cada 24 horas; máximo {data.rules.perIpDailyCap} vistas monetizadas por persona al día.</Rule>
          <Rule icon={<AlertIcon />}>No cuentan las reproducciones con bloqueador de anuncios, de bots, ni las tuyas propias.</Rule>
          <Rule icon={<LockIcon />}>Las ganancias quedan {data.rules.holdDays} días en revisión antes de poder cobrarse. El tráfico fraudulento se descuenta.</Rule>
        </ul>
      </Card>
    </div>
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
