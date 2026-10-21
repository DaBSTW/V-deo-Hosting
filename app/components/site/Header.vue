<script setup lang="ts">
import { CircleDollarSign, LayoutDashboard, LogOut, Menu as MenuIcon, ShieldCheck, Upload, Video, X } from "lucide-vue-next";
import type { MenuEntry } from "~/types/ui";

const { t } = useI18n();
const { user, logout } = useSession();
const route = useRoute();
const mobileOpen = ref(false);
watch(() => route.fullPath, () => (mobileOpen.value = false));

interface NavLink {
  label: string;
  to: string;
  active: boolean;
}
const nav = computed<NavLink[]>(() => {
  const folder = route.query.folder;
  if (user.value) {
    const onDash = route.path.startsWith("/dashboard");
    const links: NavLink[] = [
      { label: t("ui.home"), to: "/", active: route.path === "/" },
      { label: t("ui.myVideos"), to: "/dashboard?folder=all", active: onDash && folder !== "monetization" && folder !== "admin" && folder !== undefined },
      { label: t("sidebar.overview"), to: "/dashboard", active: onDash && folder === undefined },
      { label: t("sidebar.monetization"), to: "/dashboard?folder=monetization", active: onDash && folder === "monetization" },
    ];
    if (user.value.isAdmin) links.push({ label: t("sidebar.admin"), to: "/dashboard?folder=admin", active: onDash && folder === "admin" });
    return links;
  }
  return [
    { label: t("landing.nav.features"), to: "/#features", active: false },
    { label: t("landing.nav.howItWorks"), to: "/#how", active: false },
    { label: t("landing.nav.monetization"), to: "/#monetization", active: false },
    { label: t("landing.nav.faq"), to: "/#faq", active: false },
  ];
});

const accountMenu = computed<MenuEntry[]>(() => [
  { heading: user.value?.email ?? "" },
  { label: t("sidebar.overview"), icon: LayoutDashboard, onSelect: () => navigateTo("/dashboard") },
  { label: t("ui.myVideos"), icon: Video, onSelect: () => navigateTo("/dashboard?folder=all") },
  { label: t("sidebar.monetization"), icon: CircleDollarSign, onSelect: () => navigateTo("/dashboard?folder=monetization") },
  ...(user.value?.isAdmin ? [{ label: t("sidebar.admin"), icon: ShieldCheck, onSelect: () => navigateTo("/dashboard?folder=admin") }] : []),
  "separator",
  { label: t("sidebar.logout"), icon: LogOut, danger: true, onSelect: () => logout() },
]);
const displayName = computed(() => user.value?.name || user.value?.email || "");
</script>

<template>
  <header class="relative z-30">
    <div class="mx-auto grid max-w-[1280px] grid-cols-[1fr_auto] items-center gap-3 px-4 py-4 sm:px-6 lg:grid-cols-[auto_1fr_auto]">
      <NuxtLink to="/" class="hover-bright press justify-self-start rounded-xl" :aria-label="t('ui.home')">
        <SiteLogo />
      </NuxtLink>

      <nav :aria-label="t('landing.nav.menu')" class="hidden justify-center gap-1 lg:flex">
        <NuxtLink
          v-for="link in nav"
          :key="link.to"
          :to="link.to"
          :class="[
            'press rounded-xl px-3.5 py-2 text-[15px] font-semibold transition',
            link.active ? 'bg-brand-highlight text-brand' : 'text-primary hover:bg-button hover:text-contrast',
          ]"
          >{{ link.label }}</NuxtLink
        >
      </nav>

      <div class="flex items-center justify-end gap-1.5">
        <SiteThemeToggle class="max-sm:!hidden" />
        <template v-if="user">
          <UiButton to="/dashboard?folder=all&upload=1" color="brand" class="max-sm:!hidden">
            <Upload />
            {{ t("sidebar.upload") }}
          </UiButton>
          <UiMenu :items="accountMenu" :label="t('ui.account')" width="w-64">
            <template #trigger="{ toggle, open }">
              <button
                type="button"
                class="hover-bright press flex items-center gap-2 rounded-full bg-button p-1 pr-1 sm:pr-3"
                :aria-expanded="open"
                :aria-label="t('ui.account')"
                @click="toggle"
              >
                <UiAvatar :name="displayName" size="sm" />
                <span class="hidden max-w-32 truncate text-sm font-semibold text-contrast sm:block">{{ displayName }}</span>
              </button>
            </template>
          </UiMenu>
        </template>
        <template v-else>
          <UiButton to="/login" color="transparent" class="max-sm:!hidden">{{ t("landing.nav.signIn") }}</UiButton>
          <UiButton to="/register" color="brand">{{ t("landing.nav.createAccount") }}</UiButton>
        </template>
        <UiButton color="transparent" icon-only class="lg:hidden" :aria-label="mobileOpen ? t('ui.closeMenu') : t('ui.openMenu')" :aria-expanded="mobileOpen" @click="mobileOpen = !mobileOpen">
          <X v-if="mobileOpen" />
          <MenuIcon v-else />
        </UiButton>
      </div>
    </div>

    <Transition enter-active-class="transition duration-150" enter-from-class="-translate-y-2 opacity-0" leave-active-class="transition duration-100" leave-to-class="opacity-0">
      <nav v-if="mobileOpen" :aria-label="t('landing.nav.menu')" class="absolute inset-x-0 top-full mx-4 rounded-2xl bg-raised p-2 shadow-floating lg:hidden">
        <NuxtLink
          v-for="link in nav"
          :key="link.to"
          :to="link.to"
          :class="['block rounded-xl px-4 py-3 font-semibold', link.active ? 'bg-brand-highlight text-brand' : 'text-contrast hover:bg-button']"
          >{{ link.label }}</NuxtLink
        >
        <NuxtLink v-if="!user" to="/login" class="block rounded-xl px-4 py-3 font-semibold text-contrast hover:bg-button">{{ t("landing.nav.signIn") }}</NuxtLink>
        <NuxtLink v-else to="/dashboard?folder=all&upload=1" class="flex items-center gap-2 rounded-xl px-4 py-3 font-semibold text-brand hover:bg-button"><Upload class="h-5 w-5" />{{ t("sidebar.upload") }}</NuxtLink>
        <div class="mt-1 flex items-center justify-between gap-2 border-t border-divider px-2 pt-2 sm:hidden">
          <SiteLanguageSelect />
          <SiteThemeToggle />
        </div>
      </nav>
    </Transition>
  </header>
</template>
