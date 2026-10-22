<script setup lang="ts">
import { LEGAL_SLUGS } from "#shared/content/legal/links";
withDefaults(defineProps<{ compact?: boolean }>(), {});
const { t } = useI18n();
const { user } = useSession();
const appName = useAppName();
const year = new Date().getFullYear();
</script>

<template>
  <footer class="mt-auto border-t border-divider bg-bg">
    <div v-if="!compact" class="mx-auto grid max-w-[1280px] grid-cols-2 gap-x-6 gap-y-10 px-4 py-14 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
      <div class="col-span-2 md:col-span-1">
        <SiteLogo />
        <p class="mt-4 max-w-xs text-sm leading-relaxed text-secondary">{{ t("ui.footerTagline") }}</p>
        <div class="mt-5 flex flex-wrap items-center gap-2">
          <SiteLanguageSelect />
          <SiteThemeToggle />
        </div>
      </div>
      <nav :aria-label="t('ui.footerProduct')">
        <h3 class="mb-3 text-sm font-extrabold text-contrast">{{ t("ui.footerProduct") }}</h3>
        <ul class="space-y-2.5 text-sm">
          <li><NuxtLink to="/#features" class="text-secondary hover:text-contrast hover:underline">{{ t("landing.nav.features") }}</NuxtLink></li>
          <li><NuxtLink to="/#how" class="text-secondary hover:text-contrast hover:underline">{{ t("landing.nav.howItWorks") }}</NuxtLink></li>
          <li><NuxtLink to="/#monetization" class="text-secondary hover:text-contrast hover:underline">{{ t("landing.nav.monetization") }}</NuxtLink></li>
          <li><NuxtLink to="/#faq" class="text-secondary hover:text-contrast hover:underline">{{ t("landing.nav.faq") }}</NuxtLink></li>
          <li><NuxtLink to="/premium" class="font-semibold text-premium hover:underline">Premium</NuxtLink></li>
        </ul>
      </nav>
      <nav :aria-label="t('ui.footerAccount')">
        <h3 class="mb-3 text-sm font-extrabold text-contrast">{{ t("ui.footerAccount") }}</h3>
        <ul class="space-y-2.5 text-sm">
          <template v-if="user">
            <li><NuxtLink to="/dashboard" class="text-secondary hover:text-contrast hover:underline">{{ t("ui.dashboard") }}</NuxtLink></li>
            <li><NuxtLink to="/dashboard?folder=monetization" class="text-secondary hover:text-contrast hover:underline">{{ t("sidebar.monetization") }}</NuxtLink></li>
          </template>
          <template v-else>
            <li><NuxtLink to="/login" class="text-secondary hover:text-contrast hover:underline">{{ t("landing.nav.signIn") }}</NuxtLink></li>
            <li><NuxtLink to="/register" class="text-secondary hover:text-contrast hover:underline">{{ t("landing.nav.createAccount") }}</NuxtLink></li>
          </template>
        </ul>
      </nav>
      <nav :aria-label="t('footer.legal')">
        <h3 class="mb-3 text-sm font-extrabold text-contrast">{{ t("ui.footerLegal") }}</h3>
        <ul class="space-y-2.5 text-sm">
          <li v-for="slug in LEGAL_SLUGS" :key="slug">
            <NuxtLink :to="`/legal/${slug}`" class="text-secondary hover:text-contrast hover:underline">{{ t.dynamic(`footer.links.${slug}`) }}</NuxtLink>
          </li>
        </ul>
      </nav>
    </div>
    <div class="border-t border-divider">
      <div class="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-secondary sm:px-6">
        <p>{{ t("footer.rights", { year, app: appName }) }}</p>
        <div v-if="compact" class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <NuxtLink v-for="slug in LEGAL_SLUGS" :key="slug" :to="`/legal/${slug}`" class="hover:text-contrast hover:underline">{{ t.dynamic(`footer.links.${slug}`) }}</NuxtLink>
          <SiteLanguageSelect />
        </div>
      </div>
    </div>
  </footer>
</template>
