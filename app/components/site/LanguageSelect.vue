<script setup lang="ts">
import { Languages } from "lucide-vue-next";
import { LOCALES, type AppLocale } from "#shared/i18n/config";
const { t, locale, setLocale } = useI18n();
</script>

<template>
  <label class="relative inline-flex items-center">
    <Languages class="pointer-events-none absolute left-3 h-4 w-4 text-secondary" />
    <span class="sr-only">{{ t("language.label") }}</span>
    <select
      :value="locale"
      :aria-label="t('language.label')"
      class="hover-bright h-9 cursor-pointer appearance-none rounded-xl bg-button pl-9 pr-4 text-sm font-semibold text-contrast outline-none"
      @change="setLocale(($event.target as HTMLSelectElement).value as AppLocale)"
    >
      <option v-for="l in LOCALES" :key="l" :value="l">{{ t(`language.${l}`) }}</option>
    </select>
  </label>
</template>
