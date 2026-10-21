<script setup lang="ts">
/** Etiqueta de estado con punto de color. */
withDefaults(defineProps<{ color?: "brand" | "orange" | "red" | "blue" | "purple" | "gray"; dot?: boolean }>(), { color: "gray", dot: true });
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold',
      {
        brand: 'bg-brand-soft text-brand',
        orange: 'bg-orange-soft text-orange',
        red: 'bg-red-soft text-red',
        blue: 'bg-blue-soft text-blue',
        purple: 'bg-purple-soft text-purple',
        gray: 'bg-button text-secondary',
      }[color],
    ]"
  >
    <span v-if="dot" class="h-1.5 w-1.5 rounded-full bg-current" />
    <slot />
  </span>
</template>
