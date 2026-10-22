<script setup lang="ts">
/** /premium — planes, ventajas, comparación con la cuenta gratuita y preguntas. */
import { Check, Crown, Gauge, HandCoins, MonitorPlay, Minus, Plus, Timer, X } from "lucide-vue-next";
import type { PublicPremiumInfo } from "#srv/premium/settings";
import type { UserPremium } from "#srv/premium/service";

type Plan = "MONTHLY" | "YEARLY";

const { t } = useI18n();
const fmt = useFormat();
const route = useRoute();
const { user } = useSession();
const appName = useAppName();
const { data, refresh } = await useFetch<{ info: PublicPremiumInfo; mine: UserPremium | null }>("/api/premium", { key: "premium" });

useHead(() => ({ title: t("premium.metaTitle", { app: appName }) }));

const plan = ref<Plan>(route.query.plan === "MONTHLY" ? "MONTHLY" : "YEARLY");
const loading = ref<Plan | null>(null);
const error = ref<string | null>(null);
const cancelled = computed(() => route.query.cancelled === "1");
const info = computed(() => data.value?.info);
const mine = computed(() => data.value?.mine ?? null);

const price = (p: Plan) => info.value?.plans[p].priceUsd ?? 0;
const perMonth = computed(() => fmt.formatUsd(Math.floor((price("YEARLY") / 12) * 100) / 100));

async function subscribe(p: Plan) {
  error.value = null;
  if (!user.value) return navigateTo({ path: "/register", query: { next: `/premium?plan=${p}` } });
  loading.value = p;
  try {
    const { approveUrl } = await api<{ approveUrl: string }>("/api/premium/checkout", { method: "POST", body: JSON.stringify({ plan: p }) });
    window.location.href = approveUrl;
  } catch (err) {
    error.value = (err as Error).message;
    loading.value = null;
    await refresh();
  }
}

const rows = computed(() => [
  { key: "ads", free: t("premium.compare.adsFree"), premium: t("premium.compare.adsPremium"), freeBad: true },
  { key: "wait", free: t("premium.compare.waitFree", { seconds: info.value?.freeDownloadWaitSec ?? 30 }), premium: t("premium.compare.waitPremium"), freeBad: (info.value?.freeDownloadWaitSec ?? 30) > 0 },
  { key: "speed", free: t("premium.compare.speedFree"), premium: t("premium.compare.speedPremium"), freeBad: true },
  { key: "creators", free: t("premium.compare.creatorsFree"), premium: t("premium.compare.creatorsPremium", { pct: info.value?.premiumSharePct ?? 50 }), freeBad: false },
]);

const faqs = computed(() => [
  { q: t("premium.faq.q1"), a: t("premium.faq.a1") },
  { q: t("premium.faq.q2"), a: t("premium.faq.a2") },
  { q: t("premium.faq.q3"), a: t("premium.faq.a3", { pct: info.value?.premiumSharePct ?? 50 }) },
  { q: t("premium.faq.q4"), a: t("premium.faq.a4") },
  { q: t("premium.faq.q5"), a: t("premium.faq.a5") },
]);
const openFaq = ref<number | null>(0);
</script>

<template>
  <div class="relative">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--premium-glow),transparent)]" />
    <div class="relative mx-auto max-w-[1100px] px-4 pb-20 pt-8 sm:px-6 sm:pt-14">
      <!-- Cabecera -->
      <header class="text-center">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-premium px-3 py-1 text-sm font-extrabold"><Crown class="h-4 w-4" />{{ appName }} Premium</span>
        <h1 class="mx-auto mt-5 max-w-3xl text-balance text-4xl font-extrabold leading-[1.1] text-contrast sm:text-5xl">
          {{ t("premium.heroTitle") }}
        </h1>
        <p class="mx-auto mt-4 max-w-2xl text-pretty text-lg text-secondary">{{ t("premium.heroText") }}</p>
      </header>

      <div v-if="cancelled" class="mx-auto mt-8 max-w-xl rounded-2xl bg-orange-soft px-4 py-3 text-center text-sm font-semibold text-orange" role="status">
        {{ t("premium.checkoutCancelled") }}
      </div>

      <!-- Ya es Premium -->
      <section v-if="mine?.premium" class="card mx-auto mt-10 max-w-xl text-center">
        <Crown class="mx-auto h-8 w-8 text-premium" />
        <h2 class="mt-2 text-xl font-extrabold text-contrast">{{ t("premium.alreadyTitle") }}</h2>
        <p class="mt-1 text-sm text-secondary">{{ t("premium.activeUntil", { date: fmt.formatDate(mine.premiumUntil!) }) }}</p>
        <UiButton to="/dashboard?folder=premium" color="premium" class="mt-4">{{ t("premium.manage") }}</UiButton>
      </section>

      <template v-else-if="info?.enabled">
        <!-- Planes -->
        <div class="mt-10 flex justify-center">
          <UiSegmented
            v-model="plan"
            :label="t('premium.billing')"
            :options="[
              { value: 'MONTHLY', label: t('premium.monthly') },
              { value: 'YEARLY', label: info.yearlySavingPct ? t('premium.yearlySave', { pct: info.yearlySavingPct }) : t('premium.yearly') },
            ]"
          />
        </div>
        <div class="mx-auto mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
          <section class="card flex flex-col">
            <h2 class="text-lg font-extrabold text-contrast">{{ t("premium.freePlan") }}</h2>
            <p class="mt-1 text-sm text-secondary">{{ t("premium.freePlanText") }}</p>
            <p class="mt-5 text-4xl font-extrabold text-contrast">{{ fmt.formatUsd(0) }}</p>
            <ul class="mt-5 flex-1 space-y-2.5 text-sm">
              <li class="flex items-center gap-2 text-primary"><Check class="h-4 w-4 text-brand" />{{ t("premium.freeBullets.watch") }}</li>
              <li class="flex items-center gap-2 text-primary"><Minus class="h-4 w-4 text-secondary" />{{ t("premium.freeBullets.ads") }}</li>
              <li class="flex items-center gap-2 text-primary"><Minus class="h-4 w-4 text-secondary" />{{ t("premium.freeBullets.wait", { seconds: info.freeDownloadWaitSec }) }}</li>
              <li class="flex items-center gap-2 text-primary"><Minus class="h-4 w-4 text-secondary" />{{ t("premium.freeBullets.speed") }}</li>
            </ul>
            <UiButton :to="user ? '/dashboard' : '/register'" color="standard" block class="mt-6">{{ user ? t("premium.currentPlan") : t("landing.nav.createAccount") }}</UiButton>
          </section>

          <section class="relative flex flex-col rounded-2xl bg-raised p-5 shadow-card ring-2 ring-[var(--premium-from)]">
            <span class="absolute -top-3 right-5 rounded-full bg-premium px-2.5 py-0.5 text-xs font-extrabold">{{ t("premium.recommended") }}</span>
            <h2 class="flex items-center gap-2 text-lg font-extrabold text-contrast"><Crown class="h-5 w-5 text-premium" />Premium</h2>
            <p class="mt-1 text-sm text-secondary">{{ t("premium.premiumPlanText") }}</p>
            <p class="mt-5 flex items-baseline gap-1.5">
              <span class="text-4xl font-extrabold text-contrast">{{ fmt.formatUsd(price(plan)) }}</span>
              <span class="text-sm font-semibold text-secondary">{{ plan === "YEARLY" ? t("premium.perYear") : t("premium.perMonth") }}</span>
            </p>
            <p class="mt-1 h-5 text-sm font-semibold text-premium">{{ plan === "YEARLY" ? t("premium.equivalent", { price: perMonth }) : "" }}</p>
            <ul class="mt-4 flex-1 space-y-2.5 text-sm">
              <li class="flex items-center gap-2 text-contrast"><MonitorPlay class="h-4 w-4 text-premium" />{{ t("premium.benefits.noAds") }}</li>
              <li class="flex items-center gap-2 text-contrast"><Timer class="h-4 w-4 text-premium" />{{ t("premium.benefits.noWait") }}</li>
              <li class="flex items-center gap-2 text-contrast"><Gauge class="h-4 w-4 text-premium" />{{ t("premium.benefits.fullSpeed") }}</li>
              <li class="flex items-center gap-2 text-contrast"><HandCoins class="h-4 w-4 text-premium" />{{ t("premium.benefits.supportCreators", { pct: info.premiumSharePct }) }}</li>
            </ul>
            <UiButton color="premium" size="lg" block class="mt-6" :disabled="!!loading || !info.plans[plan].available" @click="subscribe(plan)">
              <Crown />{{ loading === plan ? t("premium.redirecting") : t("premium.subscribeWithPaypal") }}
            </UiButton>
            <p v-if="!info.plans[plan].available" class="mt-2 text-center text-xs text-secondary">{{ t("premium.soon") }}</p>
            <p v-else class="mt-2 text-center text-xs text-secondary">{{ t("premium.cancelAnytime") }}</p>
            <p v-if="error" class="mt-2 text-center text-sm font-semibold text-red" role="alert">{{ error }}</p>
          </section>
        </div>
      </template>
      <p v-else class="mt-10 text-center text-secondary">{{ t("errors.premiumDisabled") }}</p>

      <!-- Comparación -->
      <section class="mt-16">
        <h2 class="text-center text-2xl font-extrabold text-contrast sm:text-3xl">{{ t("premium.compareTitle") }}</h2>
        <div class="mx-auto mt-6 max-w-3xl overflow-hidden rounded-2xl bg-raised shadow-card">
          <div class="grid grid-cols-[1.1fr_1fr_1fr] border-b border-divider px-4 py-3 text-sm font-bold text-secondary sm:px-5">
            <span />
            <span>{{ t("premium.freePlan") }}</span>
            <span class="flex items-center gap-1.5 text-contrast"><Crown class="h-4 w-4 text-premium" />Premium</span>
          </div>
          <div v-for="r in rows" :key="r.key" class="grid grid-cols-[1.1fr_1fr_1fr] items-center gap-2 border-b border-divider px-4 py-3.5 text-sm last:border-0 sm:px-5">
            <span class="font-semibold text-contrast">{{ t.dynamic(`premium.compare.${r.key}`) }}</span>
            <span class="flex items-start gap-1.5 text-secondary"><X v-if="r.freeBad" class="mt-0.5 h-4 w-4 shrink-0 text-red" />{{ r.free }}</span>
            <span class="flex items-start gap-1.5 font-semibold text-contrast"><Check class="mt-0.5 h-4 w-4 shrink-0 text-brand" />{{ r.premium }}</span>
          </div>
        </div>
      </section>

      <!-- Creadores -->
      <section class="card relative mx-auto mt-12 max-w-3xl overflow-hidden">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_0%_100%,var(--hero-glow),transparent)]" />
        <div class="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <span class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-highlight text-brand"><HandCoins class="h-6 w-6" /></span>
          <div>
            <h2 class="text-lg font-extrabold text-contrast">{{ t("premium.creatorsTitle") }}</h2>
            <p class="mt-1 text-sm text-secondary">{{ t("premium.creatorsText", { pct: info?.premiumSharePct ?? 50 }) }}</p>
          </div>
        </div>
      </section>

      <!-- Preguntas -->
      <section class="mx-auto mt-16 max-w-3xl">
        <h2 class="text-center text-2xl font-extrabold text-contrast sm:text-3xl">{{ t("landing.faq.title") }}</h2>
        <div class="mt-6 space-y-2">
          <div v-for="(f, i) in faqs" :key="i" class="rounded-2xl bg-raised shadow-card">
            <button type="button" class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-bold text-contrast" :aria-expanded="openFaq === i" @click="openFaq = openFaq === i ? null : i">
              {{ f.q }}
              <component :is="openFaq === i ? Minus : Plus" class="h-5 w-5 shrink-0 text-secondary" />
            </button>
            <p v-if="openFaq === i" class="px-5 pb-4 text-sm leading-relaxed text-secondary">{{ f.a }}</p>
          </div>
        </div>
        <p class="mt-6 text-center text-xs text-secondary">
          <IntlText k="premium.termsNote">
            <template #terms="{ text }"><NuxtLink to="/legal/terms" class="font-semibold text-brand hover:underline">{{ text }}</NuxtLink></template>
          </IntlText>
        </p>
      </section>
    </div>
  </div>
</template>
