<script setup lang="ts">
import type { NuxtError } from "#app";
import { Home, SearchX, TriangleAlert } from "lucide-vue-next";

const props = defineProps<{ error: NuxtError }>();
const { t, locale } = useI18n();
const { theme } = useTheme();
const notFound = computed(() => props.error.statusCode === 404);
useHead({ htmlAttrs: { lang: locale, "data-theme": theme }, title: () => (notFound.value ? t("notFound.title") : t("ui.errorTitle")) });
</script>

<template>
  <NuxtLayout name="default">
    <div class="relative flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_50%_at_50%_40%,var(--hero-glow),transparent)]" />
      <div class="relative text-center">
        <span class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-raised text-brand shadow-card">
          <SearchX v-if="notFound" class="h-8 w-8" />
          <TriangleAlert v-else class="h-8 w-8" />
        </span>
        <p class="mt-6 text-6xl font-extrabold tracking-tight text-contrast">{{ error.statusCode }}</p>
        <h1 class="mt-3 text-2xl font-extrabold text-contrast">{{ notFound ? t("notFound.title") : t("ui.errorTitle") }}</h1>
        <p class="mx-auto mt-2 max-w-md text-secondary">{{ notFound ? t("notFound.text") : t("ui.errorText") }}</p>
        <UiButton color="brand" class="mt-8" @click="clearError({ redirect: '/' })"><Home />{{ t("ui.notFoundHome") }}</UiButton>
      </div>
    </div>
  </NuxtLayout>
</template>
