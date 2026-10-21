<script setup lang="ts">
import { Moon, Sun } from "lucide-vue-next";
const { theme, toggle } = useTheme();
const { t } = useI18n();
const next = computed(() => (theme.value === "dark" ? "light" : "dark"));
</script>

<template>
  <UiButton color="transparent" icon-only :aria-label="t('ui.switchTheme', { theme: next })" :title="t('ui.switchTheme', { theme: next })" @click="toggle">
    <Sun v-if="theme === 'dark'" />
    <Moon v-else />
  </UiButton>
</template>
