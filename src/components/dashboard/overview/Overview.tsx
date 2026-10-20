"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatBytes, formatCount, formatDay, formatLongDuration, formatRelative } from "@/lib/format";
import type { DashboardStats } from "@/server/videos/stats";
import {
  AlertIcon, ArrowDownIcon, ArrowUpIcon, CheckIcon, ClockIcon, DatabaseIcon, DownloadIcon, EyeIcon, FilmIcon, UploadIcon,
} from "../../ui/icons";
import type { PublicVideo, VideoActions } from "../types";
import { VideoThumb } from "../VideoThumb";
import { Segmented } from "../monetization/ui";
import { ColumnChart, Sparkline } from "./ColumnChart";

type Range = 7 | 30 | 90;
type Metric = "views" | "downloads";

const RANGES: Range[] = [7, 30, 90];

interface Delta {
  text: string;
  dir: "up" | "down" | "flat";
}

/** Variación del periodo actual frente al anterior de la misma duración. */
function delta(current: number, previous: number): Delta {
  if (previous === 0) return current > 0 ? { text: "Nuevo", dir: "up" } : { text: "Sin cambios", dir: "flat" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { text: "Sin cambios", dir: "flat" };
  return { text: `${pct > 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0).replace(".", ",")} %`, dir: pct > 0 ? "up" : "down" };
}

export function Overview({
  videos,
  stats,
  actions,
  onUpload,
  refreshing,
}: {
  videos: PublicVideo[];
  stats: DashboardStats;
  actions: VideoActions;
  onUpload: () => void;
  refreshing: boolean;
}) {
  const [range, setRange] = useState<Range>(30);
  const [metric, setMetric] = useState<Metric>("views");
  const [showTable, setShowTable] = useState(false);

  const m = useMemo(() => {
    const days = stats.days;
    const cur = days.slice(-range);
    const prev = days.slice(-2 * range, -range);
    const sum = (list: typeof days, k: Metric) => list.reduce((s, d) => s + d[k], 0);
    const since = new Date(`${cur[0]?.date ?? "1970-01-01"}T00:00:00Z`).getTime();

    // Más vistos en el periodo
    const fromDate = cur[0]?.date ?? "";
    const top = stats.perVideo
      .map((pv) => {
        const inRange = pv.days.filter((d) => d.date >= fromDate);
        return { id: pv.id, views: inRange.reduce((s, d) => s + d.views, 0), downloads: inRange.reduce((s, d) => s + d.downloads, 0) };
      })
      .filter((t) => t.views + t.downloads > 0)
      .sort((a, b) => b.views - a.views || b.downloads - a.downloads)
      .slice(0, 5)
      .flatMap((t) => {
        const v = videos.find((x) => x.id === t.id);
        return v ? [{ ...t, video: v }] : [];
      });

    const live = videos.filter((v) => v.status !== "error");
    return {
      cur,
      views: sum(cur, "views"),
      downloads: sum(cur, "downloads"),
      viewsDelta: delta(sum(cur, "views"), sum(prev, "views")),
      downloadsDelta: delta(sum(cur, "downloads"), sum(prev, "downloads")),
      today: days[days.length - 1] ?? { views: 0, downloads: 0 },
      storage: live.reduce((s, v) => s + v.sizeBytes, 0),
      ready: videos.filter((v) => v.status === "ready").length,
      processing: videos.filter((v) => v.status === "processing" || v.status === "uploading").length,
      errors: videos.filter((v) => v.status === "error").length,
      content: videos.reduce((s, v) => s + (v.status === "ready" ? v.durationSec ?? 0 : 0), 0),
      lifetimeViews: videos.reduce((s, v) => s + v.views, 0),
      lifetimeDownloads: videos.reduce((s, v) => s + v.downloads, 0),
      uploadedInRange: videos.filter((v) => new Date(v.createdAt).getTime() >= since).length,
      top,
    };
  }, [stats, videos, range]);

  const attention = videos.filter((v) => v.status !== "ready").slice(0, 5);
  const recent = [...videos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const quota = stats.quotaBytes;
  const quotaPct = quota ? Math.min(100, (m.storage / quota) * 100) : 0;
  const chartData = m.cur.map((d) => ({ date: d.date, value: d[metric] }));
  const metricTotal = metric === "views" ? m.views : m.downloads;
  const topMax = Math.max(1, ...m.top.map((t) => t.views));

  return (
    <div className={`space-y-6 transition-opacity ${refreshing ? "opacity-70" : ""}`}>
      {/* Filtro de periodo: una fila, arriba, afecta a todo lo de abajo */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Periodo"
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ value: r, label: `${r} días` }))}
        />
        <p className="text-xs text-zinc-500">
          Comparado con los {range} días anteriores · actualizado {formatRelative(stats.generatedAt)}
        </p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<EyeIcon />}
          label="Reproducciones"
          value={formatCount(m.views)}
          delta={m.viewsDelta}
          foot={`Hoy: ${formatCount(m.today.views)}`}
          trend={m.cur.map((d) => d.views)}
        />
        <StatTile
          icon={<DownloadIcon />}
          label="Descargas"
          value={formatCount(m.downloads)}
          delta={m.downloadsDelta}
          foot={`Hoy: ${formatCount(m.today.downloads)}`}
          trend={m.cur.map((d) => d.downloads)}
        />
        <Card>
          <TileHeader icon={<DatabaseIcon />} label="Almacenamiento" />
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatBytes(m.storage)}</p>
          {quota ? (
            <>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-brand-100"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(quotaPct)}
                aria-label="Uso del almacenamiento"
              >
                <div
                  className={`h-full rounded-full ${quotaPct >= 95 ? "bg-red-600" : quotaPct >= 80 ? "bg-amber-500" : "bg-brand-500"}`}
                  style={{ width: `${Math.max(quotaPct, 1)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {quotaPct.toFixed(0)} % de {formatBytes(quota)}
                {quotaPct >= 80 && <span className="font-medium text-amber-700"> · queda poco espacio</span>}
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">Sin límite de almacenamiento</p>
          )}
        </Card>
        <Card>
          <TileHeader icon={<FilmIcon />} label="Videos" />
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatCount(videos.length)}</p>
          <ul className="mt-2.5 space-y-1 text-xs">
            <StatusLine tone="good" icon={<CheckIcon className="h-3.5 w-3.5" />} label="Listos" count={m.ready} />
            {m.processing > 0 && (
              <StatusLine
                tone="warning"
                icon={<span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />}
                label="Procesando"
                count={m.processing}
              />
            )}
            {m.errors > 0 && <StatusLine tone="critical" icon={<AlertIcon className="h-3.5 w-3.5" />} label="Con error" count={m.errors} />}
          </ul>
        </Card>
      </div>

      {/* Indicadores secundarios */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MiniStat icon={<ClockIcon />} label="Contenido publicado" value={formatLongDuration(m.content)} />
        <MiniStat icon={<EyeIcon />} label="Reproducciones totales" value={`${formatCount(m.lifetimeViews)}`} hint={`${formatCount(m.lifetimeDownloads)} descargas en total`} />
        <MiniStat icon={<UploadIcon />} label={`Subidos en ${range} días`} value={formatCount(m.uploadedInRange)} />
      </div>

      {/* Gráfica diaria */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">{metric === "views" ? "Reproducciones por día" : "Descargas por día"}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {formatCount(metricTotal)} en los últimos {range} días
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              label="Métrica"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "views", label: "Reproducciones" },
                { value: "downloads", label: "Descargas" },
              ]}
            />
            <button
              onClick={() => setShowTable((s) => !s)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              aria-pressed={showTable}
            >
              {showTable ? "Ver gráfica" : "Ver tabla"}
            </button>
          </div>
        </div>

        <div className="mt-5">
          {showTable ? (
            <div className="max-h-72 overflow-y-auto rounded-lg ring-1 ring-zinc-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-50 text-left text-xs text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Día</th>
                    <th className="px-3 py-2 text-right font-medium">Reproducciones</th>
                    <th className="px-3 py-2 text-right font-medium">Descargas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 tabular-nums">
                  {[...m.cur].reverse().map((d) => (
                    <tr key={d.date}>
                      <td className="px-3 py-1.5 text-zinc-600">{formatDay(d.date, true)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCount(d.views)}</td>
                      <td className="px-3 py-1.5 text-right">{formatCount(d.downloads)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <ColumnChart
                data={chartData}
                unit={metric === "views" ? "reproducciones" : "descargas"}
                label={`${metric === "views" ? "Reproducciones" : "Descargas"} por día, últimos ${range} días`}
              />
              {metricTotal === 0 && (
                <p className="mt-2 text-center text-xs text-zinc-500">
                  Aún no hay {metric === "views" ? "reproducciones" : "descargas"} en este periodo. Comparte el enlace o inserta el reproductor en tu web.
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* Más vistos */}
        <Card className="xl:col-span-3">
          <h2 className="text-sm font-semibold text-zinc-900">Más vistos</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Últimos {range} días</p>
          {m.top.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">Todavía no hay reproducciones en este periodo.</p>
          ) : (
            <ol className="mt-4 space-y-1">
              {m.top.map((t, i) => (
                <li key={t.id}>
                  <button onClick={() => actions.open(t.video)} className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-zinc-50">
                    <span className="w-4 text-xs font-semibold tabular-nums text-zinc-400">{i + 1}</span>
                    <span className="w-16 shrink-0 overflow-hidden rounded-md sm:w-20"><VideoThumb video={t.video} size="sm" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-900">{t.video.title}</span>
                      {/* Barra de magnitud (una sola tonalidad) */}
                      <span className="mt-1.5 block h-1.5 rounded-full bg-zinc-100">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(t.views / topMax) * 100}%` }} />
                      </span>
                    </span>
                    <span className="w-16 shrink-0 text-right sm:w-24">
                      <span className="block text-sm font-semibold tabular-nums">{formatCount(t.views)}</span>
                      <span className="block text-[11px] text-zinc-500">{formatCount(t.downloads)} desc.</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="space-y-6 xl:col-span-2">
          {/* Requiere atención */}
          {attention.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-zinc-900">Requiere atención</h2>
              <ul className="mt-3 divide-y divide-zinc-100">
                {attention.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-2.5">
                    {v.status === "error" ? (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertIcon className="h-3.5 w-3.5" /></span>
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{v.title}</span>
                      <span className="block text-xs text-zinc-500">
                        {v.status === "error" ? "No se pudo procesar · bórralo y súbelo de nuevo" : v.status === "processing" ? "Procesando…" : "Subida sin completar"}
                      </span>
                    </span>
                    {v.status === "error" && (
                      <button onClick={() => actions.remove(v)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                        Borrar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Recientes */}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Subidos recientemente</h2>
              <button onClick={onUpload} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50">
                <UploadIcon className="h-3.5 w-3.5" /> Subir
              </button>
            </div>
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">Aún no has subido videos.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {recent.map((v) => (
                  <li key={v.id}>
                    <button onClick={() => actions.open(v)} className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left hover:bg-zinc-50">
                      <span className="w-16 shrink-0 overflow-hidden rounded-md"><VideoThumb video={v} size="sm" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{v.title}</span>
                        <span className="block text-xs text-zinc-500">
                          {formatRelative(v.createdAt)} · {formatCount(v.views)} reproducciones
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl bg-white p-5 ring-1 ring-zinc-200/80 ${className}`}>{children}</section>;
}

function TileHeader({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">{icon}</span>
      {label}
    </div>
  );
}

function StatTile({
  icon, label, value, delta, foot, trend,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  delta: Delta;
  foot: string;
  trend: number[];
}) {
  // Texto del delta con color de texto (no de serie) + flecha: nunca solo color.
  const tone = delta.dir === "up" ? "text-[#006300]" : delta.dir === "down" ? "text-[#b42318]" : "text-zinc-500";
  return (
    <Card>
      <TileHeader icon={icon} label={label} />
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
            {delta.dir === "up" && <ArrowUpIcon className="h-3.5 w-3.5" />}
            {delta.dir === "down" && <ArrowDownIcon className="h-3.5 w-3.5" />}
            {delta.text}
          </p>
        </div>
        <Sparkline values={trend} />
      </div>
      <p className="mt-3 border-t border-zinc-100 pt-2.5 text-xs text-zinc-500">{foot}</p>
    </Card>
  );
}

function StatusLine({ tone, icon, label, count }: { tone: "good" | "warning" | "critical"; icon: ReactNode; label: string; count: number }) {
  const cls = { good: "text-[#0a7d0a]", warning: "text-amber-700", critical: "text-red-700" }[tone];
  return (
    <li className="flex items-center justify-between">
      <span className={`inline-flex items-center gap-1.5 font-medium ${cls}`}>
        {icon} {label}
      </span>
      <span className="tabular-nums text-zinc-600">{count}</span>
    </li>
  );
}

function MiniStat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 ring-1 ring-zinc-200/80">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs text-zinc-500">{label}</p>
        <p className="text-base font-semibold tracking-tight">{value}</p>
        {hint && <p className="truncate text-[11px] text-zinc-400">{hint}</p>}
      </div>
    </div>
  );
}
