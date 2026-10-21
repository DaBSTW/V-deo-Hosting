<script setup lang="ts">
/** Tarjeta del panel con título, subtítulo y acción opcional. */
withDefaults(defineProps<{ title?: string; subtitle?: string; padded?: boolean }>(), { padded: true });
</script>

<template>
  <section :class="['min-w-0 rounded-2xl bg-raised shadow-card', padded === false ? '' : 'p-5']">
    <div v-if="title || $slots.action" :class="['mb-4 flex flex-wrap items-start justify-between gap-3', padded === false ? 'px-5 pt-5' : '']">
      <div class="min-w-0">
        <h2 class="text-lg font-extrabold text-contrast">{{ title }}</h2>
        <p v-if="subtitle" class="mt-0.5 text-sm text-secondary">{{ subtitle }}</p>
      </div>
      <slot name="action" />
    </div>
    <slot />
  </section>
</template>
