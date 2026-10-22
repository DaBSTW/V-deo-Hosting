<script setup lang="ts">
/** Panel → Premium: estado de la suscripción, renovación, baja y cobros. */
import { CalendarClock, Crown, Gauge, MonitorPlay, RefreshCw, Timer } from "lucide-vue-next";
import type { PublicPremiumInfo } from "#srv/premium/settings";
import type { UserPremium } from "#srv/premium/service";

const d = useDashboard();
const dialogs = useDialogs();
const { t } = useI18n();
const fmt = useFormat();
const { refresh: refreshSession } = useSession();

const info = ref<PublicPremiumInfo | null>(null);
const mine = ref<UserPremium | null>(null);
const busy = ref(false);

async function load() {
  try {
    const res = await api<{ info: PublicPremiumInfo; mine: UserPremium }>("/api/premium");
    info.value = res.info;
    mine.value = res.mine;
  } catch (err) {
    d.notify(d.errMsg(err));
  }
}
onMounted(load);

const sub = computed(() => mine.value?.subscription ?? null);
const renewing = computed(() => sub.value?.status === "ACTIVE");
const planLabel = (p: string) => (p === "YEARLY" ? t("premium.yearly") : t("premium.monthly"));
const statusLabel = (s: string) => t.dynamic(`premium.status.${["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"].includes(s) ? s : "OTHER"}`);

async function sync() {
  busy.value = true;
  try {
    mine.value = await api<UserPremium>("/api/premium/sync", { method: "POST", body: "{}" });
    await refreshSession();
    d.notify(t("premium.synced"));
  } catch (err) {
    d.notify(d.errMsg(err));
  }
  busy.value = false;
}

const cancel = () =>
  dialogs.confirm({
    title: t("premium.cancelTitle"),
    message: t("premium.cancelMsg", { date: mine.value?.premiumUntil ? fmt.formatDate(mine.value.premiumUntil) : "—" }),
    confirmLabel: t("premium.cancelConfirm"),
    danger: true,
    onConfirm: async () => {
      try {
        mine.value = await api<UserPremium>("/api/premium/cancel", { method: "POST", body: "{}" });
        d.notify(t("premium.cancelled"));
      } catch (err) {
        d.notify(d.errMsg(err));
      }
    },
  });
</script>

<template>
  <div v-if="mine" class="space-y-5">
    <!-- Estado -->
    <section v-if="mine.premium" class="relative overflow-hidden rounded-2xl bg-raised p-5 shadow-card ring-2 ring-[var(--premium-from)]">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_100%_at_100%_0%,var(--premium-glow),transparent)]" />
      <div class="relative flex flex-wrap items-center gap-4">
        <span class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-premium"><Crown class="h-7 w-7" /></span>
        <div class="min-w-0 flex-1">
          <h2 class="text-xl font-extrabold text-contrast">{{ t("premium.youArePremium") }}</h2>
          <p class="text-sm text-secondary">
            {{ renewing && sub?.nextBillingAt ? t("premium.renewsOn", { date: fmt.formatDate(sub.nextBillingAt) }) : t("premium.activeUntil", { date: fmt.formatDate(mine.premiumUntil!) }) }}
          </p>
        </div>
        <UiButton color="standard" :disabled="busy" @click="sync"><RefreshCw :class="busy ? 'animate-spin' : ''" />{{ t("premium.refresh") }}</UiButton>
      </div>
      <ul :class="['relative mt-5 grid gap-2 text-sm', info?.speedLimit ? 'sm:grid-cols-3' : 'sm:grid-cols-2']">
        <li class="flex items-center gap-2 rounded-xl bg-button px-3 py-2.5 font-semibold text-contrast"><MonitorPlay class="h-4 w-4 text-premium" />{{ t("premium.benefits.noAds") }}</li>
        <li class="flex items-center gap-2 rounded-xl bg-button px-3 py-2.5 font-semibold text-contrast"><Timer class="h-4 w-4 text-premium" />{{ t("premium.benefits.noWait") }}</li>
        <li v-if="info?.speedLimit" class="flex items-center gap-2 rounded-xl bg-button px-3 py-2.5 font-semibold text-contrast"><Gauge class="h-4 w-4 text-premium" />{{ t("premium.benefits.fullSpeed") }}</li>
      </ul>
    </section>
    <PremiumPromo v-else :monthly-usd="info?.plans.MONTHLY.priceUsd" :yearly-usd="info?.plans.YEARLY.priceUsd" :speed-limit="info?.speedLimit" />

    <!-- Suscripción -->
    <DashCard v-if="sub" :title="t('premium.subscriptionTitle')" :subtitle="t('premium.subscriptionSubtitle')">
      <dl class="grid gap-3 text-sm sm:grid-cols-3">
        <div class="rounded-xl bg-button p-3">
          <dt class="font-semibold text-secondary">{{ t("premium.plan") }}</dt>
          <dd class="mt-1 font-extrabold text-contrast">{{ planLabel(sub.plan) }}</dd>
        </div>
        <div class="rounded-xl bg-button p-3">
          <dt class="font-semibold text-secondary">{{ t("premium.statusLabel") }}</dt>
          <dd class="mt-1"><UiBadge :color="sub.status === 'ACTIVE' ? 'brand' : sub.status === 'SUSPENDED' ? 'orange' : 'gray'">{{ statusLabel(sub.status) }}</UiBadge></dd>
        </div>
        <div class="rounded-xl bg-button p-3">
          <dt class="flex items-center gap-1.5 font-semibold text-secondary"><CalendarClock class="h-4 w-4" />{{ renewing ? t("premium.nextBilling") : t("premium.endsOn") }}</dt>
          <dd class="mt-1 font-extrabold text-contrast">{{ renewing && sub.nextBillingAt ? fmt.formatDate(sub.nextBillingAt) : mine.premiumUntil ? fmt.formatDate(mine.premiumUntil) : "—" }}</dd>
        </div>
      </dl>
      <p v-if="sub.status === 'SUSPENDED'" class="mt-3 rounded-xl bg-orange-soft px-3 py-2 text-sm font-semibold text-orange">{{ t("premium.suspendedHint") }}</p>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <UiButton v-if="sub.status === 'ACTIVE' || sub.status === 'SUSPENDED'" color="red" @click="cancel">{{ t("premium.cancelSubscription") }}</UiButton>
        <UiButton v-else to="/premium" color="premium"><Crown />{{ t("premium.resubscribe") }}</UiButton>
        <p class="text-xs text-secondary">{{ t("premium.paypalManaged") }}</p>
      </div>
    </DashCard>

    <!-- Cobros -->
    <DashCard v-if="mine.payments.length" :title="t('premium.paymentsTitle')" :padded="false">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[480px] text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-xs font-bold uppercase tracking-wide text-secondary">
              <th class="px-5 py-2.5">{{ t("premium.date") }}</th>
              <th class="px-5 py-2.5">{{ t("premium.plan") }}</th>
              <th class="px-5 py-2.5 text-right">{{ t("premium.amount") }}</th>
              <th class="px-5 py-2.5 text-right">{{ t("premium.statusLabel") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in mine.payments" :key="p.id" class="border-b border-divider last:border-0">
              <td class="px-5 py-3 font-semibold text-contrast">{{ fmt.formatDate(p.paidAt) }}</td>
              <td class="px-5 py-3 text-secondary">{{ p.periodMonths === 12 ? t("premium.yearly") : t("premium.monthly") }}</td>
              <td class="px-5 py-3 text-right font-bold tabular-nums text-contrast">{{ fmt.formatMicros(p.grossMicros) }}</td>
              <td class="px-5 py-3 text-right"><UiBadge :color="p.refunded ? 'orange' : 'brand'">{{ p.refunded ? t("premium.refunded") : t("premium.paid") }}</UiBadge></td>
            </tr>
          </tbody>
        </table>
      </div>
    </DashCard>
  </div>
  <div v-else class="h-40 animate-pulse rounded-2xl bg-raised" />
</template>
