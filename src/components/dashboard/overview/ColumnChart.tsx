"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "@/i18n/useFormat";

/**
 * Gráfica de columnas de una sola serie (sin librerías).
 * Especificaciones: columnas ≤ 24 px con extremo redondeado de 4 px y base
 * recta, 2 px de aire entre columnas, rejilla de 1 px recesiva, eje Y con
 * valores redondos compactos, tooltip por columna (ratón y teclado).
 * Una sola serie → sin leyenda: el título de la tarjeta la nombra.
 */
export interface ColumnPoint {
  date: string;
  value: number;
}

const HEIGHT = 220;
const M = { top: 12, right: 4, bottom: 26, left: 40 };
const COLOR = "var(--color-brand-500)";
const COLOR_ACTIVE = "var(--color-brand-700)";

function niceScale(max: number, integer: boolean, ticks = 4) {
  if (max <= 0) return integer ? { top: ticks, step: 1 } : { top: 1, step: 0.25 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const nice = integer ? Math.max(1, step) : step;
  return { top: Math.ceil(max / nice - 1e-9) * nice, step: nice };
}

/** Rectángulo con las dos esquinas superiores redondeadas (base recta). */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function ColumnChart({
  data,
  unit = "",
  label,
  format,
  integer = true,
}: {
  data: ColumnPoint[];
  unit?: string;
  label: string;
  /** Formato de ticks y tooltip (p. ej. moneda). */
  format?: (n: number) => string;
  /** Valores enteros (conteos) o decimales (importes). */
  integer?: boolean;
}) {
  const t = useTranslations("chart");
  const { formatCount, formatDay } = useFormat();
  const fmt = format ?? formatCount;
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const max = Math.max(0, ...data.map((d) => d.value));
  const { top, step } = niceScale(max, integer);
  const band = innerW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => M.top + innerH - (v / top) * innerH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 70))));

  const onKey = (e: KeyboardEvent) => {
    if (!data.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      setActive((a) => Math.min(data.length - 1, Math.max(0, (a ?? (dir > 0 ? -1 : data.length)) + dir)));
    }
    if (e.key === "Escape") setActive(null);
  };

  const a = active !== null ? data[active] : null;
  const tipX = active !== null ? M.left + active * band + band / 2 : 0;

  return (
    <div ref={wrap} className="relative w-full select-none">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={t("ariaHint", { label })}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className="block overflow-visible rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        {/* Rejilla + eje Y */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#d4d4d8" : "#ececee"} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-400 text-[11px] tabular-nums">
              {fmt(t)}
            </text>
          </g>
        ))}

        {/* Columnas */}
        {data.map((d, i) => {
          const h = Math.max(0, y(0) - y(d.value));
          const x = M.left + i * band + (band - barW) / 2;
          return h > 0 ? (
            <path key={d.date} d={columnPath(x, y(d.value), barW, h)} fill={active === i ? COLOR_ACTIVE : COLOR} />
          ) : null;
        })}

        {/* Eje X: unas pocas fechas, siempre la última */}
        {data.map((d, i) =>
          (data.length - 1 - i) % labelEvery === 0 ? (
            <text key={d.date} x={M.left + i * band + band / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-zinc-400 text-[11px]">
              {formatDay(d.date)}
            </text>
          ) : null,
        )}

        {/* Zonas de hover: la banda completa, más grande que la columna */}
        {data.map((d, i) => (
          <rect
            key={d.date}
            x={M.left + i * band}
            y={M.top}
            width={band}
            height={innerH}
            fill="transparent"
            onPointerEnter={() => setActive(i)}
            onPointerMove={() => setActive(i)}
          />
        ))}
      </svg>

      {a && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-center shadow-lg"
          // Anclado justo encima de la columna activa (no tapa los controles de la tarjeta).
          style={{ left: Math.min(Math.max(tipX, 60), width - 60), top: Math.max(0, y(a.value) - 8) }}
        >
          <p className="text-sm font-semibold text-white">
            {fmt(a.value)} {unit && <span className="font-normal text-zinc-400">{unit}</span>}
          </p>
          <p className="text-[11px] text-zinc-400">{formatDay(a.date, true)}</p>
        </div>
      )}
    </div>
  );
}

/** Mini tendencia para las tarjetas: línea gris y el último punto en el acento. */
export function Sparkline({ values }: { values: number[] }) {
  const W = 96;
  const H = 32;
  // Agrupa en ≤ 14 tramos para que la forma se lea (no un ruido de 90 puntos).
  const buckets = Math.min(values.length, 14);
  const size = values.length / Math.max(1, buckets);
  const pts = Array.from({ length: buckets }, (_, i) =>
    values.slice(Math.floor(i * size), Math.floor((i + 1) * size)).reduce((s, v) => s + v, 0),
  );
  if (pts.length < 2) return null;
  const max = Math.max(1, ...pts);
  const xy = pts.map((v, i) => [3 + (i / (pts.length - 1)) * (W - 6), 3 + (1 - v / max) * (H - 6)] as const);
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg width={W} height={H} aria-hidden className="overflow-visible">
      <polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" stroke="#a1a1aa" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={4} fill="var(--color-brand-500)" stroke="white" strokeWidth={2} />
    </svg>
  );
}
