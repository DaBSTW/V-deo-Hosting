<script setup lang="ts">
import type { Component } from "vue";
defineProps<{ icon: Component; label: string; value: string; hint?: string }>();
</script>

<template>
  <div class="flex min-w-0 items-center gap-3.5 rounded-2xl bg-raised px-4 py-4 shadow-card">
    <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-highlight text-brand"><component :is="icon" class="h-5 w-5" /></span>
    <div class="min-w-0">
      <p class="truncate text-sm font-semibold text-secondary">{{ label }}</p>
      <p class="text-xl font-extrabold tracking-tight text-contrast tabular-nums">{{ value }}</p>
      <p v-if="hint" class="truncate text-xs text-secondary">{{ hint }}</p>
    </div>
  </div>
</template>
