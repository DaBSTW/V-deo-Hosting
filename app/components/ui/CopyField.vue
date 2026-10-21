<script setup lang="ts">
import { Check, Copy } from "lucide-vue-next";

/** Campo de solo lectura con botón de copiar. */
const props = withDefaults(defineProps<{ value: string; label?: string; multiline?: boolean }>(), {});
const { t } = useI18n();
const copied = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.value);
  } catch {
    window.prompt(t("watch.copyPrompt"), props.value);
    return;
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1600);
}
</script>

<template>
  <div class="flex items-stretch gap-2">
    <textarea v-if="multiline" readonly :value="value" :aria-label="label" rows="3" class="input min-w-0 flex-1 resize-none font-mono text-xs" @focus="($event.target as HTMLTextAreaElement).select()" />
    <input v-else readonly :value="value" :aria-label="label" class="input min-w-0 flex-1 font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
    <UiButton :color="copied ? 'highlight' : 'standard'" :class="multiline ? '!h-auto' : ''" @click="copy">
      <component :is="copied ? Check : Copy" />
      <span class="hidden sm:inline">{{ copied ? t("watch.copied") : t("common.copy") }}</span>
    </UiButton>
  </div>
</template>
