<script setup lang="ts">
/** Interruptor accesible (role="switch"). */
defineProps<{ modelValue: boolean; label: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    :class="['relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50', modelValue ? 'bg-brand' : 'bg-raised-3']"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span :class="['inline-block h-[18px] w-[18px] rounded-full shadow transition', modelValue ? 'translate-x-[23px] bg-on-brand' : 'translate-x-[3px] bg-white']" />
  </button>
</template>
