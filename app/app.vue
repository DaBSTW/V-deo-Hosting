<script setup lang="ts">
const { theme } = useTheme();
const { locale, t } = useI18n();
const appName = useAppName();

useHead({
  htmlAttrs: { lang: locale, "data-theme": theme },
  titleTemplate: (title) => (title ? `${title} · ${appName}` : appName),
  meta: [
    { name: "description", content: () => t("meta.description") },
    { name: "theme-color", content: () => (theme.value === "dark" ? "#16181c" : "#ebebeb") },
  ],
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
