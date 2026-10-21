<script setup lang="ts">
import type { Component } from "vue";
defineProps<{ icon?: Component; title: string; text?: string }>();
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-14 text-center">
    <span v-if="icon" class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-button text-secondary [&_svg]:h-7 [&_svg]:w-7">
      <component :is="icon" />
    </span>
    <h3 class="text-lg font-extrabold text-contrast">{{ title }}</h3>
    <p v-if="text" class="mt-1 max-w-sm text-sm text-secondary">{{ text }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
</template>
