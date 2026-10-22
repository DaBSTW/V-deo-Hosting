<script setup lang="ts">
/**
 * Anuncio de Premium reutilizable (página del video, panel, portada).
 * `card`: tarjeta con ventajas; `slim`: banda compacta de una línea.
 */
import { ChevronRight, Crown, Gauge, MonitorPlay, Timer } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{ variant?: "card" | "slim"; monthlyUsd?: number | null; yearlyUsd?: number | null; speedLimit?: boolean }>(),
  { variant: "card", monthlyUsd: null, yearlyUsd: null, speedLimit: false },
);
const { t } = useI18n();
const fmt = useFormat();
const fromPrice = computed(() => {
  const m = props.monthlyUsd;
  const y = props.yearlyUsd ? props.yearlyUsd / 12 : null;
  const min = [m, y].filter((v): v is number => !!v).sort((a, b) => a - b)[0];
  return min ? fmt.formatUsd(Math.floor(min * 100) / 100) : null;
});
</script>

<template>
  <section v-if="variant === 'card'" class="card relative overflow-hidden">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_100%_0%,var(--premium-glow),transparent)]" />
    <div class="relative">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-premium px-2.5 py-1 text-xs font-extrabold"><Crown class="h-3.5 w-3.5" />Premium</span>
      <h2 class="mt-3 text-lg font-extrabold leading-snug text-contrast">{{ t("premium.promoTitle") }}</h2>
      <ul class="mt-3 space-y-2 text-sm text-primary">
        <li class="flex items-center gap-2"><MonitorPlay class="h-4 w-4 shrink-0 text-premium" />{{ t("premium.benefits.noAds") }}</li>
        <li class="flex items-center gap-2"><Timer class="h-4 w-4 shrink-0 text-premium" />{{ t("premium.benefits.noWait") }}</li>
        <li v-if="speedLimit" class="flex items-center gap-2"><Gauge class="h-4 w-4 shrink-0 text-premium" />{{ t("premium.benefits.fullSpeed") }}</li>
      </ul>
      <p v-if="fromPrice" class="mt-4 text-sm font-semibold text-secondary">
        <span class="text-2xl font-extrabold text-contrast">{{ fromPrice }}</span> {{ t("premium.perMonth") }}
      </p>
      <UiButton to="/premium" color="premium" block :class="fromPrice ? 'mt-2' : 'mt-4'"><Crown />{{ t("premium.cta") }}</UiButton>
    </div>
  </section>
  <NuxtLink
    v-else
    to="/premium"
    class="hover-bright press flex items-center gap-3 rounded-2xl border border-divider bg-raised px-4 py-3 shadow-card"
  >
    <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-premium"><Crown class="h-5 w-5" /></span>
    <span class="min-w-0 flex-1">
      <span class="block text-sm font-extrabold text-contrast">{{ t("premium.slimTitle") }}</span>
      <span class="block truncate text-xs text-secondary">{{ speedLimit ? t("premium.slimText") : t("premium.slimTextNoSpeed") }}</span>
    </span>
    <span v-if="fromPrice" class="shrink-0 text-sm font-bold text-premium">{{ t("premium.fromShort", { price: fromPrice }) }}</span>
    <ChevronRight v-else class="h-5 w-5 shrink-0 text-premium" />
  </NuxtLink>
</template>
