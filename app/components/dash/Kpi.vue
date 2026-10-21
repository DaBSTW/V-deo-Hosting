<script setup lang="ts">
/** Contador destacado (estilo «stat» de Modrinth): icono, etiqueta, valor y pista. */
import type { Component } from "vue";
defineProps<{ icon: Component; label: string; value: string; hint?: string; accent?: boolean }>();
</script>

<template>
  <section :class="['relative min-w-0 overflow-hidden rounded-2xl p-5 shadow-card', accent ? 'bg-raised ring-2 ring-brand' : 'bg-raised']">
    <div v-if="accent" class="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_90%_at_100%_0%,var(--hero-glow),transparent)]" />
    <div class="relative flex items-center gap-2.5 text-sm font-bold text-secondary">
      <span :class="['flex h-9 w-9 items-center justify-center rounded-xl', accent ? 'bg-brand text-on-brand' : 'bg-button text-primary']">
        <component :is="icon" class="h-[18px] w-[18px]" />
      </span>
      {{ label }}
    </div>
    <p class="relative mt-3 text-3xl font-extrabold tracking-tight text-contrast tabular-nums">{{ value }}</p>
    <p v-if="hint || $slots.hint" class="relative mt-1 text-sm text-secondary"><slot name="hint">{{ hint }}</slot></p>
    <div class="relative"><slot /></div>
  </section>
</template>
