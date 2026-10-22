<script setup lang="ts">
/**
 * /premium/return — PayPal vuelve aquí tras aprobar la suscripción. Se lee el
 * estado real en PayPal (POST /api/premium/sync); si el primer cobro aún no
 * aparece, se reintenta unos segundos.
 */
import { CircleAlert, Crown, LoaderCircle } from "lucide-vue-next";
import type { UserPremium } from "#srv/premium/service";

const { t } = useI18n();
const fmt = useFormat();
const route = useRoute();
const { refresh } = useSession();
useHead(() => ({ title: t("premium.returnTitle"), meta: [{ name: "robots", content: "noindex" }] }));

const state = ref<"loading" | "active" | "pending" | "error">("loading");
const result = ref<UserPremium | null>(null);
const error = ref<string | null>(null);
const subscriptionId = typeof route.query.subscription_id === "string" ? route.query.subscription_id : undefined;

async function sync(attempt = 0): Promise<void> {
  try {
    result.value = await api<UserPremium>("/api/premium/sync", { method: "POST", body: JSON.stringify({ subscriptionId }) });
    if (result.value.premium) {
      state.value = "active";
      await refresh();
      return;
    }
    if (attempt < 8) {
      state.value = "pending";
      setTimeout(() => void sync(attempt + 1), 4000);
    } else state.value = "pending";
  } catch (err) {
    error.value = (err as Error).message;
    state.value = "error";
  }
}
onMounted(() => void sync());
</script>

<template>
  <div class="mx-auto flex min-h-[60vh] max-w-lg items-center px-4 py-16">
    <section class="card w-full text-center">
      <template v-if="state === 'loading' || state === 'pending'">
        <LoaderCircle class="mx-auto h-9 w-9 animate-spin text-premium" />
        <h1 class="mt-4 text-xl font-extrabold text-contrast">{{ state === "loading" ? t("premium.confirming") : t("premium.pendingTitle") }}</h1>
        <p class="mt-1 text-sm text-secondary">{{ state === "loading" ? t("premium.confirmingText") : t("premium.pendingText") }}</p>
      </template>
      <template v-else-if="state === 'active'">
        <span class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-premium"><Crown class="h-7 w-7" /></span>
        <h1 class="mt-4 text-2xl font-extrabold text-contrast">{{ t("premium.welcomeTitle") }}</h1>
        <p class="mt-1 text-sm text-secondary">{{ t("premium.welcomeText", { date: fmt.formatDate(result!.premiumUntil!) }) }}</p>
        <div class="mt-6 flex flex-wrap justify-center gap-2">
          <UiButton to="/dashboard?folder=premium" color="premium">{{ t("premium.manage") }}</UiButton>
          <UiButton to="/" color="standard">{{ t("ui.home") }}</UiButton>
        </div>
      </template>
      <template v-else>
        <CircleAlert class="mx-auto h-9 w-9 text-red" />
        <h1 class="mt-4 text-xl font-extrabold text-contrast">{{ t("premium.errorTitle") }}</h1>
        <p class="mt-1 text-sm text-secondary">{{ error }}</p>
        <UiButton to="/premium" color="standard" class="mt-5">{{ t("premium.backToPlans") }}</UiButton>
      </template>
    </section>
  </div>
</template>
