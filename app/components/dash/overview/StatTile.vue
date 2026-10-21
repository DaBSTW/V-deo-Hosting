<script setup lang="ts">
/** KPI con variación frente al periodo anterior y mini tendencia. */
import { ArrowDown, ArrowUp } from "lucide-vue-next";
import type { Component } from "vue";

interface Delta {
  /** `new`: no había datos en el periodo anterior. */
  kind: "new" | "flat" | "pct";
  pct?: number;
  dir: "up" | "down" | "flat";
}

const props = defineProps<{ icon: Component; label: string; value: string; delta: Delta; foot: string; trend: number[] }>();
const { t, locale } = useI18n();

const deltaText = computed(() => {
  const d = props.delta;
  if (d.kind === "new") return t("overview.deltaNew");
  if (d.kind === "flat") return t("overview.deltaFlat");
  return new Intl.NumberFormat(locale.value, {
    style: "percent",
    maximumFractionDigits: Math.abs(d.pct!) < 10 ? 1 : 0,
    signDisplay: "always",
  }).format(d.pct! / 100);
});
// Color de texto + flecha: nunca solo color.
const tone = computed(() =>
  props.delta.dir === "up" ? "bg-brand-soft text-brand" : props.delta.dir === "down" ? "bg-red-soft text-red" : "bg-button text-secondary",
);
</script>

<template>
  <section class="min-w-0 rounded-2xl bg-raised p-5 shadow-card">
    <div class="flex items-center gap-2.5 text-sm font-bold text-secondary">
      <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-button text-primary"><component :is="icon" class="h-[18px] w-[18px]" /></span>
      {{ label }}
    </div>
    <div class="mt-3 flex items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-3xl font-extrabold tracking-tight text-contrast tabular-nums">{{ value }}</p>
        <p :class="['mt-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold', tone]">
          <ArrowUp v-if="delta.dir === 'up'" class="h-3.5 w-3.5" />
          <ArrowDown v-else-if="delta.dir === 'down'" class="h-3.5 w-3.5" />
          {{ deltaText }}
        </p>
      </div>
      <DashOverviewSparkline :values="trend" />
    </div>
    <p class="mt-4 border-t border-divider pt-3 text-sm font-semibold text-secondary">{{ foot }}</p>
  </section>
</template>
