<script setup lang="ts">
/** Mini tendencia para las tarjetas: línea recesiva y el último punto en verde. */
const props = defineProps<{ values: number[] }>();
const W = 96;
const H = 32;
const shape = computed(() => {
  // Agrupa en ≤ 14 tramos para que la forma se lea (no un ruido de 90 puntos).
  const buckets = Math.min(props.values.length, 14);
  const size = props.values.length / Math.max(1, buckets);
  const pts = Array.from({ length: buckets }, (_, i) =>
    props.values.slice(Math.floor(i * size), Math.floor((i + 1) * size)).reduce((s, v) => s + v, 0),
  );
  if (pts.length < 2) return null;
  const max = Math.max(1, ...pts);
  const xy = pts.map((v, i) => [3 + (i / (pts.length - 1)) * (W - 6), 3 + (1 - v / max) * (H - 6)] as const);
  return { points: xy.map((p) => p.join(",")).join(" "), last: xy[xy.length - 1]! };
});
</script>

<template>
  <svg v-if="shape" :width="W" :height="H" aria-hidden="true" class="shrink-0 overflow-visible">
    <polyline :points="shape.points" fill="none" stroke="var(--text-secondary)" stroke-opacity="0.6" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
    <circle :cx="shape.last[0]" :cy="shape.last[1]" r="4" fill="var(--brand)" stroke="var(--surface-3)" stroke-width="2" />
  </svg>
</template>
