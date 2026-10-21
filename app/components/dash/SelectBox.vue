<script setup lang="ts">
import { Check } from "lucide-vue-next";
defineProps<{ checked: boolean; light?: boolean }>();
const emit = defineEmits<{ toggle: [range: boolean] }>();
const { t } = useI18n();
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="checked"
    :aria-label="t('video.select')"
    :class="[
      'flex h-6 w-6 items-center justify-center rounded-lg border-2 transition',
      checked ? 'border-brand bg-brand text-on-brand' : light ? 'border-raised-3 bg-button text-transparent hover:border-secondary' : 'border-white/80 bg-black/30 text-transparent hover:bg-black/50',
    ]"
    @click.stop="emit('toggle', ($event as MouseEvent).shiftKey)"
  >
    <Check class="h-3.5 w-3.5" stroke-width="3" />
  </button>
</template>
