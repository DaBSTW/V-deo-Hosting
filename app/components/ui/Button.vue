<script setup lang="ts">
/**
 * Botón del sistema de diseño. Colores: `brand` (acción principal), `standard`,
 * `red` (destructivo), `transparent`, `outline` y `premium` (degradado de Premium). Con `to` es un enlace interno
 * y con `href` uno externo.
 */
import type { RouteLocationRaw } from "vue-router";

const props = withDefaults(
  defineProps<{
    color?: "brand" | "standard" | "red" | "transparent" | "outline" | "highlight" | "premium";
    size?: "sm" | "md" | "lg";
    to?: RouteLocationRaw;
    href?: string;
    type?: "button" | "submit";
    disabled?: boolean;
    iconOnly?: boolean;
    block?: boolean;
  }>(),
  { color: "standard", size: "md", type: "button" },
);

const sizeCls = computed(() => {
  if (props.iconOnly) return { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" }[props.size];
  return { sm: "h-8 gap-1.5 px-3 text-sm", md: "h-10 gap-2 px-4 text-sm", lg: "h-12 gap-2.5 px-6 text-base" }[props.size];
});
const colorCls = computed(
  () =>
    ({
      brand: "bg-brand text-on-brand",
      standard: "bg-button text-contrast",
      red: "bg-red text-white",
      premium: "bg-premium",
      highlight: "bg-brand-highlight text-brand",
      transparent: "bg-transparent text-primary hover:!bg-button hover:text-contrast",
      outline: "border border-divider bg-transparent text-contrast hover:!bg-button",
    })[props.color],
);
const cls = computed(() => [
  "hover-bright press inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl font-semibold transition disabled:opacity-50 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0",
  props.color !== "transparent" && props.color !== "outline" ? "shadow-[var(--shadow-inset-sm)]" : "",
  sizeCls.value,
  colorCls.value,
  props.block ? "w-full" : "",
]);
</script>

<template>
  <NuxtLink v-if="to && !disabled" :to="to" :class="cls"><slot /></NuxtLink>
  <a v-else-if="href && !disabled" :href="href" :class="cls"><slot /></a>
  <button v-else :type="type" :disabled="disabled" :class="cls"><slot /></button>
</template>
