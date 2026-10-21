<script setup lang="ts">
import { X } from "lucide-vue-next";

/** Ventana modal: cierra con Escape, clic fuera o el botón ×. */
const props = withDefaults(defineProps<{ open: boolean; title?: string; size?: "sm" | "md" | "lg" | "xl" }>(), { size: "md" });
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const width = computed(() => ({ sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" })[props.size]);
const onKey = (e: KeyboardEvent) => e.key === "Escape" && emit("close");
watch(
  () => props.open,
  (open) => {
    if (!import.meta.client) return;
    if (open) document.addEventListener("keydown", onKey);
    else document.removeEventListener("keydown", onKey);
    document.documentElement.style.overflow = open ? "hidden" : "";
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (!import.meta.client) return;
  document.removeEventListener("keydown", onKey);
  document.documentElement.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" @mousedown.self="emit('close')">
        <div role="dialog" aria-modal="true" :aria-label="title" :class="['flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-raised shadow-floating sm:rounded-2xl', width]">
          <header v-if="title || $slots.header" class="flex items-center justify-between gap-4 px-5 pb-2 pt-4">
            <slot name="header">
              <h2 class="truncate text-lg font-extrabold text-contrast">{{ title }}</h2>
            </slot>
            <UiButton color="transparent" size="sm" icon-only :aria-label="t('common.close')" @click="emit('close')"><X /></UiButton>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
