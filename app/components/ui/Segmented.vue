<script setup lang="ts" generic="T extends string | number">
/** Selector segmentado (estilo «píldoras»). */
defineProps<{ modelValue: T; options: { value: T; label: string }[]; label: string }>();
const emit = defineEmits<{ "update:modelValue": [T] }>();
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="inline-flex gap-1 rounded-xl bg-button p-1">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      role="radio"
      :aria-checked="o.value === modelValue"
      :class="['rounded-lg px-3 py-1 text-sm font-semibold transition', o.value === modelValue ? 'bg-brand-highlight text-brand' : 'text-secondary hover:text-contrast']"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
