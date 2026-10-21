<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="relative flex flex-1 items-center justify-center px-4 py-12">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_50%_at_50%_30%,var(--hero-glow),transparent)]" />
    <div class="relative w-full max-w-[420px]">
      <div class="card !p-7">
        <h1 class="mb-6 text-2xl font-extrabold text-contrast">{{ title }}</h1>
        <slot />
      </div>
    </div>
  </div>
</template>
