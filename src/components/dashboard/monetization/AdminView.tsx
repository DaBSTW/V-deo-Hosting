"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCount, formatDate, formatMicros } from "@/lib/format";
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

const DOC_LABELS: Record<string, string> = { ID_CARD: "Documento de identidad", PASSPORT: "Pasaporte", DRIVER_LICENSE: "Licencia de conducir" };
const FILE_LABELS = { front: "Frente", back: "Dorso", selfie: "Selfie" } as const;
const ageOf = (iso: string) => {
  const b = new Date(`${iso}T00:00:00Z`);
  const n = new Date();
  return n.getUTCFullYear() - b.getUTCFullYear() - (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate()) ? 1 : 0);
};

const METHOD_LABELS: Record<PayoutMethod, string> = {
  PAYPAL: "PayPal",
  USDT_TRC20: "USDT (TRC20)",
  PAYONEER: "Payoneer",
  BANK: "Transferencia bancaria",
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.details?.[0] ?? data.error ?? "No se pudo completar la operación");
  return data as T;
}

/** Panel de administración: ajustes de monetización, Monetag y cola de pagos. */
export function AdminView({ notify, openDialog }: { notify: (msg: string) => void; openDialog: (d: DialogState) => void }) {
  const [settings, setSettings] = useState<MonetizationSettings | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [kyc, setKyc] = useState<Verification[]>([]);
  const [viewer, setViewer] = useState<{ src: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, p, k] = await Promise.all([
        call<{ settings: MonetizationSettings; summary: Summary }>("/api/admin/monetization"),
        call<{ payouts: AdminPayout[] }>("/api/admin/payouts"),
        call<{ verifications: Verification[] }>("/api/admin/kyc"),
      ]);
      setKyc(k.verifications);
      setSettings(a.settings);
      setSummary(a.summary);
      setPayouts(p.payouts);
      setDirty(false);
    } catch (err) {
      notify((err as Error).message);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings || !summary) return <div className="py-24 text-center text-sm text-zinc-500">Cargando…</div>;

  const set = <K extends keyof MonetizationSettings>(k: K, v: MonetizationSettings[K]) => {
    setSettings({ ...settings, [k]: v });
    setDirty(true);
  };

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
      notify("Ajustes guardados");
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const act = async (p: AdminPayout, action: "approve" | "pay" | "reject", extra: { reference?: string; note?: string } = {}) => {
    try {
      const r = await call<{ payouts: AdminPayout[] }>(`/api/admin/payouts/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, ...extra }),
      });
      setPayouts(r.payouts);
      notify(action === "approve" ? "Pago aprobado" : action === "pay" ? "Pago marcado como enviado" : "Pago rechazado: el importe vuelve al saldo del usuario");
      void call<{ settings: MonetizationSettings; summary: Summary }>("/api/admin/monetization").then((a) => setSummary(a.summary));
      return true;
    } catch (err) {
      notify((err as Error).message);
      return false;
    }
  };

  const review = async (v: Verification, action: "approve" | "reject", note?: string) => {
    try {
      const r = await call<{ verifications: Verification[] }>(`/api/admin/kyc/${v.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, note }),
      });
      setKyc(r.verifications);
      notify(action === "approve" ? `Identidad de ${v.fullName} verificada` : "Verificación rechazada");
      void call<{ payouts: AdminPayout[] }>("/api/admin/payouts").then((p) => setPayouts(p.payouts));
      return true;
    } catch (err) {
      notify((err as Error).message);
      return false;
    }
  };
  const regionName = (c: string) => {
    try {
      return new Intl.DisplayNames(["es"], { type: "region" }).of(c) ?? c;
    } catch {
      return c;
    }
  };

  const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi accent icon={<WalletIcon />} label="Debes a tus usuarios" value={formatMicros(summary.liabilityMicros)} hint="Ganado y aún sin solicitar ni pagar" />
        <Kpi icon={<AlertIcon />} label="Pagos por gestionar" value={formatMicros(summary.pendingPayouts.amountMicros)} hint={`${summary.pendingPayouts.count} solicitudes`} />
        <Kpi icon={<CoinsIcon />} label="Generado (7 días)" value={formatMicros(summary.earnedWeekMicros)} hint={`Hoy ${formatMicros(summary.earnedTodayMicros)} · ${formatCount(summary.paidViewsWeek)} vistas monetizadas`} />
        <Kpi icon={<LockIcon />} label="Pagado este mes" value={formatMicros(summary.paidThisMonthMicros)} />
      </div>

      {/* Verificaciones de identidad */}
      <Card>
        <CardTitle title="Verificaciones de identidad" subtitle="Comprueba que el documento sea legible, que la selfie coincida y que el nombre coincida con el titular del método de cobro" />
        {kyc.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No hay verificaciones pendientes.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {kyc.map((v) => (
              <li key={v.id} className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{v.fullName}</p>
                  <p className="text-xs text-zinc-500">{v.email} · enviada {formatDate(v.createdAt)}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <div><dt className="text-zinc-400">Nacimiento</dt><dd>{v.birthDate} ({ageOf(v.birthDate)} años)</dd></div>
                    <div><dt className="text-zinc-400">País</dt><dd>{regionName(v.country)}</dd></div>
                    <div><dt className="text-zinc-400">{DOC_LABELS[v.documentType] ?? v.documentType}</dt><dd className="font-mono">{v.documentNumber}</dd></div>
                    <div><dt className="text-zinc-400">Cobro</dt><dd className="truncate" title={v.payout ?? ""}>{v.payout ?? "—"}</dd></div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {v.files.map((f) => {
                      const src = `/api/admin/kyc/${v.id}/file/${f}`;
                      return (
                        <button
                          key={f}
                          onClick={() => setViewer({ src, title: `${v.fullName} · ${FILE_LABELS[f]}` })}
                          className="group relative h-20 w-28 overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-200"
                          title="Ampliar"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={FILE_LABELS[f]} className="h-full w-full object-cover transition group-hover:scale-105" />
                          <span className="absolute bottom-1 left-1 rounded bg-zinc-900/80 px-1 text-[10px] text-white">{FILE_LABELS[f]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-start gap-2 lg:flex-col lg:items-stretch">
                  <button onClick={() => review(v, "approve")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                    Aprobar
                  </button>
                  <button
                    onClick={() =>
                      openDialog({
                        kind: "prompt",
                        title: `Rechazar verificación de ${v.fullName}`,
                        label: "Motivo (lo verá el usuario; p. ej. «la foto del frente está borrosa»)",
                        confirmLabel: "Rechazar",
                        onSubmit: (note) => review(v, "reject", note),
                      })
                    }
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50"
                  >
                    Rechazar
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
              <button onClick={() => setViewer(null)} className="rounded-lg px-3 py-1 hover:bg-white/10">Cerrar</button>
            </figcaption>
          </figure>
        </div>
      )}

      {/* Cola de pagos */}
      <Card>
        <CardTitle title="Pagos por gestionar" subtitle="Revisa, envía el pago por tu cuenta y márcalo como pagado con la referencia" />
        {payouts.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No hay solicitudes pendientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr className="border-b border-zinc-100">
                  <th className="py-2 pr-3 font-medium">Usuario</th>
                  <th className="py-2 pr-3 text-right font-medium">Importe</th>
                  <th className="py-2 pr-3 font-medium">Método · destino</th>
                  <th className="py-2 pr-3 font-medium">Solicitado</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 text-right font-medium">Acciones</th>
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
                        <p className="text-xs text-red-600">Identidad sin verificar</p>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{formatMicros(p.amountMicros)}</td>
                    <td className="py-2.5 pr-3">
                      <p>{METHOD_LABELS[p.method as PayoutMethod] ?? p.method}</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(p.details).then(() => notify("Destino copiado"))}
                        className="max-w-[240px] truncate font-mono text-xs text-zinc-500 hover:text-zinc-800"
                        title="Copiar"
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
                            Aprobar
                          </button>
                        )}
                        <button
                          disabled={!p.verifiedName}
                          onClick={() =>
                            openDialog({
                              kind: "prompt",
                              title: `Marcar como pagado · ${formatMicros(p.amountMicros)}`,
                              label: "Referencia del pago (id de transacción, hash…)",
                              confirmLabel: "Marcar pagado",
                              onSubmit: (reference) => act(p, "pay", { reference }),
                            })
                          }
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Pagado
                        </button>
                        <button
                          onClick={() =>
                            openDialog({
                              kind: "prompt",
                              title: "Rechazar pago",
                              label: "Motivo (lo verá el usuario)",
                              confirmLabel: "Rechazar",
                              onSubmit: (note) => act(p, "reject", { note }),
                            })
                          }
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Rechazar
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
          title="Ajustes de monetización"
          subtitle="Los cambios de tarifa se aplican a las vistas a partir de ahora (no recalculan el pasado)"
          action={
            <button onClick={save} disabled={!dirty || saving} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? "Guardando…" : dirty ? "Guardar cambios" : "Guardado"}
            </button>
          }
        />

        <div className="flex items-center justify-between gap-4 rounded-xl bg-zinc-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Monetización activa</p>
            <p className="text-xs text-zinc-500">Muestra los anuncios de Monetag y acumula ganancias para los usuarios.</p>
          </div>
          <Switch checked={settings.enabled} onChange={(v) => set("enabled", v)} label="Monetización activa" />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Tarifas (USD por 1.000 vistas)</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["T1", "T2", "T3"] as const).map((t) => (
                <label key={t} className="text-xs font-medium text-zinc-600">
                  Nivel {t.slice(1)}
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={settings.rates[t]}
                    onChange={(e) => set("rates", { ...settings.rates, [t]: num(e.target.value) })}
                    className={`mt-1 ${inputCls}`}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Reglas antifraude</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs font-medium text-zinc-600">
                Seg. mínimos
                <input type="number" min={5} value={settings.minWatchSeconds} onChange={(e) => set("minWatchSeconds", num(e.target.value))} className={`mt-1 ${inputCls}`} />
              </label>
              <label className="text-xs font-medium text-zinc-600">
                Días retención
                <input type="number" min={0} value={settings.holdDays} onChange={(e) => set("holdDays", num(e.target.value))} className={`mt-1 ${inputCls}`} />
              </label>
              <label className="text-xs font-medium text-zinc-600">
                Máx. por IP/día
                <input type="number" min={1} value={settings.perIpDailyCap} onChange={(e) => set("perIpDailyCap", num(e.target.value))} className={`mt-1 ${inputCls}`} />
              </label>
            </div>
          </fieldset>
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Métodos de cobro</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(METHOD_LABELS) as PayoutMethod[]).map((m) => {
              const cfg = settings.payoutMethods[m] ?? { enabled: false, minUsd: 10 };
              return (
                <div key={m} className="rounded-xl border border-zinc-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{METHOD_LABELS[m]}</span>
                    <Switch checked={cfg.enabled} onChange={(v) => set("payoutMethods", { ...settings.payoutMethods, [m]: { ...cfg, enabled: v } })} label={METHOD_LABELS[m]} />
                  </div>
                  <label className="mt-2 block text-xs text-zinc-500">
                    Mínimo (USD)
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
        <CardTitle title="Monetag" subtitle="Pega aquí el código que te da Monetag. Se inserta solo en el reproductor y en el enlace directo de videos monetizados." />
        <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm text-zinc-600">
          <li>En Monetag, añade tu dominio como sitio.</li>
          <li>Verifícalo con la etiqueta <code className="rounded bg-zinc-100 px-1">&lt;meta&gt;</code> (campo 1). Si usas el formato Push, pega el contenido del archivo <code className="rounded bg-zinc-100 px-1">sw.js</code> (campo 3); se servirá en <code className="rounded bg-zinc-100 px-1">/sw.js</code>.</li>
          <li>Crea las zonas (p. ej. OnClick/Popunder, In-Page Push o Vignette) y pega su código en el campo 2.</li>
          <li>Guarda, activa la monetización y comprueba un video en una ventana privada sin bloqueador.</li>
        </ol>
        <div className="space-y-4">
          <label className="block text-xs font-medium text-zinc-600">
            1 · Etiqueta de verificación (<code>&lt;meta …&gt;</code>)
            <input value={settings.monetagMetaTag} onChange={(e) => set("monetagMetaTag", e.target.value)} placeholder='<meta name="monetag" content="…">' className={`mt-1 font-mono text-xs ${inputCls}`} />
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            2 · Código de anuncios para el reproductor
            <textarea rows={5} value={settings.monetagPlayerSnippet} onChange={(e) => set("monetagPlayerSnippet", e.target.value)} placeholder="<script>…</script>" className={`mt-1 font-mono text-xs ${inputCls}`} />
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            3 · Contenido de <code>sw.js</code> (solo formato Push)
            <textarea rows={3} value={settings.monetagServiceWorker} onChange={(e) => set("monetagServiceWorker", e.target.value)} placeholder="self.options = { … }; importScripts(…)" className={`mt-1 font-mono text-xs ${inputCls}`} />
          </label>
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Este código se ejecuta tal cual en tus páginas públicas: pega solo código oficial de tu cuenta de Monetag.
          </p>
        </div>
      </Card>

      {/* Revisión antifraude */}
      <Card>
        <CardTitle title="Usuarios que más generan (7 días)" subtitle="Revisa picos anómalos antes de aprobar pagos" />
        {summary.topEarners.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">Sin actividad monetizada todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr className="border-b border-zinc-100">
                <th className="py-2 font-medium">Usuario</th>
                <th className="py-2 text-right font-medium">Vistas monetizadas</th>
                <th className="py-2 text-right font-medium">Generado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 tabular-nums">
              {summary.topEarners.map((t) => (
                <tr key={t.email}>
                  <td className="py-2">{t.email}</td>
                  <td className="py-2 text-right">{formatCount(t.views)}</td>
                  <td className="py-2 text-right font-medium">{formatMicros(t.amountMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
