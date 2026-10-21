<script setup lang="ts">
/** Avatar con la inicial (color estable derivado del texto). */
const props = withDefaults(defineProps<{ name: string; size?: "sm" | "md" | "lg" }>(), { size: "md" });
const initial = computed(() => (props.name.trim()[0] ?? "?").toUpperCase());
const hue = computed(() => [...props.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
</script>

<template>
  <span
    :class="['inline-flex shrink-0 select-none items-center justify-center rounded-full font-extrabold text-black', { sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-lg' }[size]]"
    :style="{ background: `hsl(${hue} 70% 68%)` }"
    aria-hidden="true"
    >{{ initial }}</span
  >
</template>
