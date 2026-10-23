<script setup lang="ts">
/**
 * Cabecera global.
 *  - Páginas públicas: navegación de la portada + acceso (o «Ir al panel» con sesión).
 *  - Dentro del panel: solo logo, tema y cuenta. La navegación vive en la barra
 *    lateral; en móvil se abre con el botón junto al logo (estado `dash-drawer`).
 */
import { Crown, House, LayoutDashboard, LogOut, Menu as MenuIcon, PanelLeft, X } from "lucide-vue-next";
import type { MenuEntry } from "~/types/ui";

const { t } = useI18n();
const { user, logout } = useSession();
const route = useRoute();
const mobileOpen = ref(false);
const drawer = useState("dash-drawer", () => false);
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false;
    drawer.value = false;
  },
);

const inApp = computed(() => route.path === "/dashboard" || route.path.startsWith("/dashboard/"));

const nav = computed(() => [
  { label: t("landing.nav.features"), to: "/#features" },
  { label: t("landing.nav.howItWorks"), to: "/#how" },
  { label: t("landing.nav.player"), to: "/#player" },
  { label: t("landing.nav.monetization"), to: "/#monetization" },
  { label: t("landing.nav.faq"), to: "/#faq" },
]);

const accountMenu = computed<MenuEntry[]>(() => [
  { heading: user.value?.email ?? "" },
  inApp.value
    ? { label: t("ui.home"), icon: House, onSelect: () => navigateTo("/") }
    : { label: t("landing.nav.dashboard"), icon: LayoutDashboard, onSelect: () => navigateTo("/dashboard") },
  { label: user.value?.premium ? t("premium.manage") : t("premium.getPremium"), icon: Crown, onSelect: () => navigateTo(user.value?.premium ? "/dashboard?folder=premium" : "/premium") },
  "separator",
  { label: t("sidebar.logout"), icon: LogOut, danger: true, onSelect: () => logout() },
]);
const displayName = computed(() => user.value?.name || user.value?.email || "");
</script>

<template>
  <header class="relative z-30">
    <div class="mx-auto grid max-w-[1280px] grid-cols-[1fr_auto] items-center gap-3 px-4 py-4 sm:px-6 lg:grid-cols-[auto_1fr_auto]">
      <div class="flex items-center gap-2 justify-self-start">
        <UiButton
          v-if="inApp"
          color="standard"
          icon-only
          class="lg:!hidden"
          :aria-label="t('dashboard.menu')"
          :aria-expanded="drawer"
          @click="drawer = true"
          ><PanelLeft
        /></UiButton>
        <NuxtLink to="/" class="hover-bright press rounded-xl" :aria-label="t('ui.home')">
          <SiteLogo />
        </NuxtLink>
      </div>

      <nav v-if="!inApp" :aria-label="t('landing.nav.menu')" class="hidden justify-center gap-1 lg:flex">
        <NuxtLink
          v-for="link in nav"
          :key="link.to"
          :to="link.to"
          class="press rounded-xl px-3.5 py-2 text-[15px] font-semibold text-primary transition hover:bg-button hover:text-contrast"
          >{{ link.label }}</NuxtLink
        >
        <NuxtLink
          to="/premium"
          class="press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[15px] font-bold transition hover:bg-button"
          ><Crown class="h-4 w-4 text-premium" /><span class="text-premium">Premium</span></NuxtLink
        >
      </nav>
      <div v-else class="hidden lg:block" />

      <div class="flex items-center justify-end gap-1.5">
        <!-- Premium siempre a la vista: insignia si ya lo es, botón para hacerse Premium si no. -->
        <NuxtLink
          v-if="user?.premium"
          to="/dashboard?folder=premium"
          class="hover-bright press inline-flex h-10 items-center gap-1.5 rounded-xl bg-premium-soft px-3 text-sm font-bold text-contrast"
          :aria-label="t('premium.manage')"
          ><Crown class="h-4 w-4 text-premium" /><span class="max-sm:hidden">Premium</span></NuxtLink
        >
        <UiButton v-else-if="inApp" to="/premium" color="premium" :aria-label="t('premium.getPremium')"><Crown /><span class="max-sm:hidden">{{ t("premium.getPremium") }}</span></UiButton>
        <SiteThemeToggle :class="inApp ? '' : 'max-sm:!hidden'" />
        <template v-if="user">
          <UiButton v-if="!inApp" to="/dashboard" color="brand" class="max-sm:!hidden"><LayoutDashboard />{{ t("landing.nav.dashboard") }}</UiButton>
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
        <UiButton
          v-if="!inApp"
          color="transparent"
          icon-only
          class="lg:!hidden"
          :aria-label="mobileOpen ? t('ui.closeMenu') : t('ui.openMenu')"
          :aria-expanded="mobileOpen"
          @click="mobileOpen = !mobileOpen"
        >
          <X v-if="mobileOpen" />
          <MenuIcon v-else />
        </UiButton>
      </div>
    </div>

    <Transition enter-active-class="transition duration-150" enter-from-class="-translate-y-2 opacity-0" leave-active-class="transition duration-100" leave-to-class="opacity-0">
      <nav v-if="mobileOpen && !inApp" :aria-label="t('landing.nav.menu')" class="absolute inset-x-0 top-full mx-4 rounded-2xl bg-raised p-2 shadow-floating lg:hidden">
        <NuxtLink v-for="link in nav" :key="link.to" :to="link.to" class="block rounded-xl px-4 py-3 font-semibold text-contrast hover:bg-button">{{ link.label }}</NuxtLink>
        <NuxtLink to="/premium" class="flex items-center gap-2 rounded-xl px-4 py-3 font-bold hover:bg-button"><Crown class="h-5 w-5 text-premium" /><span class="text-premium">Premium</span></NuxtLink>
        <NuxtLink v-if="user" to="/dashboard" class="flex items-center gap-2 rounded-xl px-4 py-3 font-semibold text-brand hover:bg-button"><LayoutDashboard class="h-5 w-5" />{{ t("landing.nav.dashboard") }}</NuxtLink>
        <NuxtLink v-else to="/login" class="block rounded-xl px-4 py-3 font-semibold text-contrast hover:bg-button">{{ t("landing.nav.signIn") }}</NuxtLink>
        <div class="mt-1 flex items-center justify-between gap-2 border-t border-divider px-2 pt-2 sm:hidden">
          <SiteLanguageSelect />
          <SiteThemeToggle />
        </div>
      </nav>
    </Transition>
  </header>
</template>
