<script setup lang="ts">
const route = useRoute();
const compactFooter = computed(() => route.path.startsWith("/dashboard"));
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SiteHeader />
    <main class="flex-1"><slot /></main>
    <SiteFooter :compact="compactFooter" />
  </div>
</template>
