<script setup lang="ts">
/**
 * Gráfica de columnas de una sola serie (sin librerías), con tooltip por
 * columna (ratón y teclado). Una sola serie → sin leyenda.
 */
export interface ColumnPoint {
  date: string;
  value: number;
}

const props = withDefaults(
  defineProps<{ data: ColumnPoint[]; unit?: string; label: string; format?: (n: number) => string; integer?: boolean }>(),
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
  ro = new ResizeObserver(([e]) => (width.value = Math.max(240, e.contentRect.width)));
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

const innerW = computed(() => width.value - M.left - M.right);
const innerH = HEIGHT - M.top - M.bottom;
const scale = computed(() => niceScale(Math.max(0, ...props.data.map((d) => d.value)), props.integer));
const band = computed(() => innerW.value / Math.max(1, props.data.length));
const barW = computed(() => Math.max(2, Math.min(24, band.value - 2)));
const y = (v: number) => M.top + innerH - (v / scale.value.top) * innerH;
const ticks = computed(() =>
  Array.from({ length: Math.round(scale.value.top / scale.value.step) + 1 }, (_, i) => Math.round(i * scale.value.step * 1e6) / 1e6),
);
const labelEvery = computed(() => Math.max(1, Math.ceil(props.data.length / Math.max(2, Math.floor(innerW.value / 70)))));

function onKey(e: KeyboardEvent) {
  const n = props.data.length;
  if (!n) return;
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    active.value = Math.min(n - 1, Math.max(0, (active.value ?? (dir > 0 ? -1 : n)) + dir));
  }
  if (e.key === "Escape") active.value = null;
}
const point = computed(() => (active.value !== null ? props.data[active.value] : null));
const tipLeft = computed(() => {
  const x = active.value !== null ? M.left + active.value * band.value + band.value / 2 : 0;
  return Math.min(Math.max(x, 60), width.value - 60);
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
      class="block overflow-visible rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-highlight"
      @keydown="onKey"
      @blur="active = null"
      @pointerleave="active = null"
    >
      <g v-for="tk in ticks" :key="tk">
        <line :x1="M.left" :x2="width - M.right" :y1="y(tk)" :y2="y(tk)" stroke="var(--divider)" :stroke-width="1" shape-rendering="crispEdges" />
        <text :x="M.left - 8" :y="y(tk)" dy="0.32em" text-anchor="end" class="fill-[var(--text-secondary)] text-[11px] tabular-nums">{{ fmt(tk) }}</text>
      </g>
      <template v-for="(d, i) in data" :key="`c${d.date}`">
        <path
          v-if="y(0) - y(d.value) > 0"
          :d="columnPath(M.left + i * band + (band - barW) / 2, y(d.value), barW, y(0) - y(d.value))"
          :fill="active === i ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 70%, transparent)'"
        />
      </template>
      <template v-for="(d, i) in data" :key="`l${d.date}`">
        <text
          v-if="(data.length - 1 - i) % labelEvery === 0"
          :x="M.left + i * band + band / 2"
          :y="HEIGHT - 8"
          text-anchor="middle"
          class="fill-[var(--text-secondary)] text-[11px]"
        >
          {{ f.formatDay(d.date) }}
        </text>
      </template>
      <rect
        v-for="(d, i) in data"
        :key="`h${d.date}`"
        :x="M.left + i * band"
        :y="M.top"
        :width="band"
        :height="innerH"
        fill="transparent"
        @pointerenter="active = i"
        @pointermove="active = i"
      />
    </svg>
    <div
      v-if="point"
      role="status"
      class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-divider bg-raised-2 px-3 py-1.5 text-center shadow-floating"
      :style="{ left: `${tipLeft}px`, top: `${Math.max(0, y(point.value) - 8)}px` }"
    >
      <p class="text-sm font-extrabold text-contrast">
        {{ fmt(point.value) }} <span v-if="unit" class="font-semibold text-secondary">{{ unit }}</span>
      </p>
      <p class="text-[11px] text-secondary">{{ f.formatDay(point.date, true) }}</p>
    </div>
  </div>
</template>
