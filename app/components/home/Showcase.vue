<script setup lang="ts">
/**
 * Ilustración del producto hecha con HTML/CSS (sin capturas): el panel con
 * la biblioteca, un reproductor y tarjetas flotantes. Puramente decorativa.
 */
import { Check, Code, Eye, Play, Upload } from "lucide-vue-next";
const { t } = useI18n();
const BARS = [34, 48, 40, 62, 55, 78, 92];
const CARDS = [
  { hue: 150, len: "w-3/4", time: "12:04" },
  { hue: 205, len: "w-2/3", time: "03:41" },
  { hue: 275, len: "w-4/5", time: "27:15" },
  { hue: 25, len: "w-1/2", time: "08:09" },
];
</script>

<template>
  <div aria-hidden="true" class="relative mx-auto w-full max-w-5xl select-none">
    <div class="absolute -inset-x-10 -top-10 bottom-0 rounded-[3rem] bg-[radial-gradient(ellipse_at_center,var(--hero-glow),transparent_70%)]" />
    <div class="relative overflow-hidden rounded-2xl border border-divider bg-surface shadow-floating">
      <div class="flex items-center gap-2 border-b border-divider px-4 py-3">
        <span class="h-3 w-3 rounded-full bg-raised-3" />
        <span class="h-3 w-3 rounded-full bg-raised-3" />
        <span class="h-3 w-3 rounded-full bg-raised-3" />
        <span class="ml-3 h-6 max-w-sm flex-1 rounded-lg bg-raised" />
      </div>
      <div class="grid grid-cols-1 gap-4 p-4 md:grid-cols-[180px_1fr]">
        <div class="hidden space-y-1.5 rounded-xl bg-raised p-2 md:block">
          <div class="flex items-center gap-2 rounded-lg bg-brand-highlight px-3 py-2 text-xs font-bold text-brand"><Play class="h-3.5 w-3.5" />{{ t("sidebar.allVideos") }}</div>
          <div v-for="w in ['w-16', 'w-20', 'w-14']" :key="w" class="flex items-center gap-2 px-3 py-2"><span class="h-3.5 w-3.5 rounded bg-raised-3" /><span :class="['h-2 rounded bg-raised-3', w]" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div v-for="c in CARDS" :key="c.hue" class="overflow-hidden rounded-xl bg-raised">
            <div class="relative aspect-video" :style="{ background: `linear-gradient(135deg, hsl(${c.hue} 60% 38%), hsl(${c.hue + 40} 50% 16%))` }">
              <span class="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">{{ c.time }}</span>
            </div>
            <div class="space-y-1.5 p-2.5">
              <div :class="['h-2.5 rounded bg-raised-3', c.len]" />
              <div class="flex items-center gap-1 text-[10px] font-semibold text-secondary"><Eye class="h-3 w-3" /><span class="h-1.5 w-8 rounded bg-raised-3" /></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="absolute -left-3 top-20 hidden w-56 rounded-2xl border border-divider bg-raised p-3.5 shadow-floating sm:block lg:-left-12">
      <div class="flex items-center gap-2 text-xs font-bold text-contrast">
        <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-highlight text-brand"><Upload class="h-4 w-4" /></span>
        {{ t("landing.mockup.uploading") }}
      </div>
      <div class="mt-3 h-2 rounded-full bg-button"><div class="h-2 w-[68%] rounded-full bg-brand" /></div>
    </div>

    <div class="absolute -right-3 top-4 hidden rounded-2xl border border-divider bg-raised p-3.5 shadow-floating sm:block lg:-right-10">
      <div class="flex items-center gap-1.5 text-xs font-bold text-brand"><Check class="h-4 w-4" />{{ t("landing.mockup.ready") }}</div>
      <div class="mt-2.5 flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-on-brand"><Code class="h-4 w-4" />{{ t("landing.mockup.copyIframe") }}</div>
    </div>

    <div class="absolute -bottom-8 right-10 hidden w-60 rounded-2xl border border-divider bg-raised p-3.5 shadow-floating md:block">
      <div class="text-[11px] font-bold text-secondary">{{ t("landing.mockup.views") }}</div>
      <div class="mt-2.5 flex h-14 items-end gap-1.5">
        <div v-for="(h, i) in BARS" :key="i" class="flex-1 rounded-md" :class="i === BARS.length - 1 ? 'bg-brand' : 'bg-brand-highlight'" :style="{ height: `${h}%` }" />
      </div>
      <div class="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-secondary"><span class="h-2 w-2 rounded-full bg-brand" />{{ t("landing.mockup.monetized") }}</div>
    </div>
  </div>
</template>
