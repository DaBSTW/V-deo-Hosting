<script setup lang="ts">
/**
 * Marca de la plataforma: una «d» con un play dentro del círculo.
 * Si el nombre empieza por «d» (Dembed), el símbolo hace de primera letra y se
 * lee «dembed»; con otro nombre, el símbolo va delante del nombre completo.
 */
withDefaults(defineProps<{ size?: "md" | "lg"; text?: boolean }>(), { size: "md", text: true });
const appName = useAppName();
const startsWithD = computed(() => appName.trim().toLowerCase().startsWith("d"));
const rest = computed(() => (startsWithD.value ? appName.trim().slice(1).toLowerCase() : appName));
</script>

<template>
  <span class="inline-flex items-baseline" :aria-label="appName" role="img">
    <svg
      :class="[size === 'lg' ? 'h-[42px] w-[42px] translate-y-[6px]' : 'h-[35px] w-[35px] translate-y-[5px]', text && startsWithD ? (size === 'lg' ? '-mr-[8px]' : '-mr-[7px]') : text ? 'mr-2.5' : '']"
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <circle cx="27" cy="38" r="17" fill="var(--brand)" />
      <rect x="39" y="7" width="9" height="48" rx="4.5" fill="var(--brand)" />
      <path d="M21.5 30.6v14.8a1.5 1.5 0 0 0 2.3 1.3l11.4-7.4a1.5 1.5 0 0 0 0-2.6l-11.4-7.4a1.5 1.5 0 0 0-2.3 1.3Z" fill="var(--surface-1)" />
    </svg>
    <span v-if="text" aria-hidden="true" :class="['font-extrabold tracking-[-0.035em] text-contrast', size === 'lg' ? 'text-[30px]' : 'text-[25px]']">{{ rest }}</span>
  </span>
</template>
