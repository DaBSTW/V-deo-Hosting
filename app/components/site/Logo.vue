<script setup lang="ts">
/** Marca de la plataforma (símbolo propio + nombre configurable). */
withDefaults(defineProps<{ size?: "md" | "lg"; text?: boolean }>(), { size: "md", text: true });
const appName = useAppName();
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <svg :class="size === 'lg' ? 'h-10 w-10' : 'h-8 w-8'" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M12.5 9.8v12.4c0 .8.9 1.3 1.6.9l9.6-6.2c.6-.4.6-1.4 0-1.8l-9.6-6.2c-.7-.4-1.6.1-1.6.9z" fill="var(--surface-1)" />
    </svg>
    <span v-if="text" :class="['font-extrabold tracking-tight text-contrast', size === 'lg' ? 'text-2xl' : 'text-xl']">{{ appName }}</span>
  </span>
</template>
