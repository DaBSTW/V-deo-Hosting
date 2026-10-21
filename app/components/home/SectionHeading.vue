<script setup lang="ts">
defineProps<{ eyebrow: string; title: string; subtitle?: string; center?: boolean }>();
</script>

<template>
  <div :class="center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'">
    <p class="text-sm font-extrabold uppercase tracking-wider text-brand">{{ eyebrow }}</p>
    <h2 class="mt-2 text-3xl font-extrabold tracking-tight text-contrast sm:text-4xl">{{ title }}</h2>
    <p v-if="subtitle" class="mt-4 text-lg text-secondary">{{ subtitle }}</p>
  </div>
</template>
