<script setup lang="ts">
/**
 * Gráfica de columnas de una sola serie (sin librerías).
 * Columnas ≤ 24 px con extremo redondeado y base recta, rejilla recesiva,
 * eje Y con valores redondos compactos y tooltip por columna (ratón y
 * teclado), anclado encima de la columna activa.
 */
interface ColumnPoint {
  date: string;
  value: number;
}

const props = withDefaults(
  defineProps<{
    data: ColumnPoint[];
    unit?: string;
    label: string;
    /** Formato de ticks y tooltip (p. ej. moneda). */
    format?: (n: number) => string;
    /** Valores enteros (conteos) o decimales (importes). */
    integer?: boolean;
  }>(),
  { unit: "", integer: true },
);

const { t } = useI18n();
const f = useFormat();
const fmt = (n: number) => (props.format ? props.format(n) : f.formatCount(n));

const HEIGHT = 220;
const M = { top: 12, right: 4, bottom: 26, left: 44 };

const wrap = ref<HTMLElement>();
const width = ref(640);
const active = ref<number | null>(null);
let ro: ResizeObserver | undefined;
onMounted(() => {
  if (!wrap.value) return;
  ro = new ResizeObserver(([e]) => (width.value = Math.max(240, e!.contentRect.width)));
  ro.observe(wrap.value);
});
onBeforeUnmount(() => ro?.disconnect());

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

const geo = computed(() => {
  const innerW = width.value - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const max = Math.max(0, ...props.data.map((d) => d.value));
  const { top, step } = niceScale(max, props.integer);
  const band = innerW / Math.max(1, props.data.length);
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => M.top + innerH - (v / top) * innerH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
  const labelEvery = Math.max(1, Math.ceil(props.data.length / Math.max(2, Math.floor(innerW / 70))));
  return { innerH, band, barW, y, ticks, labelEvery };
});

const bars = computed(() =>
  props.data.map((d, i) => {
    const { y, band, barW } = geo.value;
    const h = Math.max(0, y(0) - y(d.value));
    const x = M.left + i * band + (band - barW) / 2;
    return { key: d.date, path: h > 0 ? columnPath(x, y(d.value), barW, h) : null };
  }),
);

function onKey(e: KeyboardEvent) {
  const n = props.data.length;
  if (!n) return;
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const cur = active.value ?? (dir > 0 ? -1 : n);
    active.value = Math.min(n - 1, Math.max(0, cur + dir));
  }
  if (e.key === "Escape") active.value = null;
}

const tip = computed(() => {
  if (active.value === null) return null;
  const a = props.data[active.value];
  if (!a) return null;
  const x = M.left + active.value * geo.value.band + geo.value.band / 2;
  return { a, left: Math.min(Math.max(x, 60), width.value - 60), top: Math.max(0, geo.value.y(a.value) - 8) };
});
</script>

<template>
  <div ref="wrap" class="relative w-full select-none">
    <svg
      :width="width"
      :height="HEIGHT"
      role="img"
      :aria-label="t('chart.ariaHint', { label })"
      tabindex="0"
      class="block overflow-visible rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand"
      @keydown="onKey"
      @blur="active = null"
      @pointerleave="active = null"
    >
      <g v-for="tk in geo.ticks" :key="tk">
        <line
          :x1="M.left"
          :x2="width - M.right"
          :y1="geo.y(tk)"
          :y2="geo.y(tk)"
          :stroke="tk === 0 ? 'var(--surface-5)' : 'var(--divider)'"
          :stroke-opacity="tk === 0 ? 1 : 0.6"
          stroke-width="1"
          shape-rendering="crispEdges"
        />
        <text :x="M.left - 8" :y="geo.y(tk)" dy="0.32em" text-anchor="end" class="fill-secondary text-[11px] font-semibold tabular-nums">{{ fmt(tk) }}</text>
      </g>

      <template v-for="(b, i) in bars" :key="b.key">
        <path v-if="b.path" :d="b.path" :fill="active === i ? 'var(--brand)' : active === null ? 'var(--brand)' : 'var(--brand-highlight)'" />
      </template>

      <template v-for="(d, i) in data" :key="`x-${d.date}`">
        <text
          v-if="(data.length - 1 - i) % geo.labelEvery === 0"
          :x="M.left + i * geo.band + geo.band / 2"
          :y="HEIGHT - 8"
          text-anchor="middle"
          class="fill-secondary text-[11px] font-semibold"
          >{{ f.formatDay(d.date) }}</text
        >
      </template>

      <rect
        v-for="(d, i) in data"
        :key="`h-${d.date}`"
        :x="M.left + i * geo.band"
        :y="M.top"
        :width="geo.band"
        :height="geo.innerH"
        fill="transparent"
        @pointerenter="active = i"
        @pointermove="active = i"
      />
    </svg>

    <div
      v-if="tip"
      role="status"
      class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-divider bg-raised-2 px-3 py-1.5 text-center shadow-floating"
      :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
    >
      <p class="text-sm font-extrabold text-contrast">
        {{ fmt(tip.a.value) }} <span v-if="unit" class="font-semibold text-secondary">{{ unit }}</span>
      </p>
      <p class="text-[11px] font-semibold text-secondary">{{ f.formatDay(tip.a.date, true) }}</p>
    </div>
  </div>
</template>
