<script setup lang="ts">
/** Administración → Premium: precios, ajustes, planes de PayPal, ingresos y suscriptores. */
import { CircleAlert, Crown, RefreshCw, Repeat, TrendingUp, Users } from "lucide-vue-next";
import type { PremiumSettings } from "#srv/premium/settings";

interface Summary {
  configured: boolean;
  subscribers: number;
  activeMonthly: number;
  activeYearly: number;
  mrrMicros: number;
  monthGrossMicros: number;
  monthNetMicros: number;
  monthAmortizedMicros: number;
  recent: { email: string; plan: string; status: string; providerSubscriptionId: string; premiumUntil: string | null; createdAt: string }[];
}

const d = useDashboard();
const { t } = useI18n();
const fmt = useFormat();
const settings = ref<PremiumSettings | null>(null);
const summary = ref<Summary | null>(null);
const dirty = ref(false);
const busy = ref<"save" | "plans" | "subs" | null>(null);
const webhookUrl = computed(() => (import.meta.client ? `${window.location.origin}/api/webhooks/paypal` : "/api/webhooks/paypal"));

const apply = (r: { settings: PremiumSettings; summary: Summary }) => {
  settings.value = r.settings;
  summary.value = r.summary;
  dirty.value = false;
};
onMounted(async () => {
  try {
    apply(await api("/api/admin/premium"));
  } catch (err) {
    d.notify(d.errMsg(err));
  }
});
const num = (v: string) => (v === "" ? 0 : Number(v));
const touch = () => (dirty.value = true);
/** Planes cuyo precio ya no coincide con el plan creado en PayPal. */
const stale = computed(() => (settings.value ? (["MONTHLY", "YEARLY"] as const).filter((p) => settings.value!.plans[p].planId === "" || settings.value!.plans[p].planPriceUsd !== settings.value!.plans[p].priceUsd) : []));

async function run(kind: "save" | "plans" | "subs") {
  if (!settings.value) return;
  busy.value = kind;
  try {
    if (kind === "save") {
      apply(await api("/api/admin/premium", { method: "PUT", body: JSON.stringify(settings.value) }));
      d.notify(t("admin.saved"));
    } else {
      const r = await api<{ settings: PremiumSettings; summary: Summary; result: { total: number; ok: number } | null }>("/api/admin/premium", {
        method: "POST",
        body: JSON.stringify({ action: kind === "plans" ? "syncPlans" : "syncAll" }),
      });
      apply(r);
      d.notify(kind === "plans" ? t("adminPremium.plansSynced") : t("adminPremium.subsSynced", { ok: r.result?.ok ?? 0, total: r.result?.total ?? 0 }));
    }
  } catch (err) {
    d.notify(d.errMsg(err));
  }
  busy.value = null;
}
</script>

<template>
  <div v-if="settings && summary" class="space-y-5">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <DashKpi :icon="Users" :label="t('adminPremium.subscribers')" :value="fmt.formatCount(summary.subscribers)" :hint="t('adminPremium.byPlan', { monthly: summary.activeMonthly, yearly: summary.activeYearly })" />
      <DashKpi :icon="Repeat" :label="t('adminPremium.mrr')" :value="fmt.formatMicros(summary.mrrMicros)" :hint="t('adminPremium.mrrHint')" />
      <DashKpi :icon="TrendingUp" :label="t('adminPremium.monthGross')" :value="fmt.formatMicros(summary.monthGrossMicros)" :hint="t('adminPremium.monthNet', { net: fmt.formatMicros(summary.monthNetMicros) })" />
      <DashKpi :icon="Crown" :label="t('adminPremium.amortized')" :value="fmt.formatMicros(summary.monthAmortizedMicros)" :hint="t('adminPremium.amortizedHint', { pct: settings.premiumSharePct })" />
    </div>

    <DashCard :title="t('adminPremium.title')" :subtitle="t('adminPremium.subtitle')">
      <template #action>
        <UiButton color="brand" :disabled="!dirty || !!busy" @click="run('save')">{{ busy === "save" ? t("common.saving") : dirty ? t("admin.saveChanges") : t("admin.saved") }}</UiButton>
      </template>

      <p v-if="!summary.configured" class="mb-4 flex items-start gap-2 rounded-xl bg-orange-soft px-3 py-2.5 text-sm font-semibold text-orange">
        <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" />{{ t("adminPremium.notConfigured") }}
      </p>

      <div class="flex items-center justify-between gap-4 rounded-xl bg-button px-4 py-3">
        <div class="min-w-0">
          <p class="font-bold text-contrast">{{ t("adminPremium.enabled") }}</p>
          <p class="text-sm text-secondary">{{ t("adminPremium.enabledHint") }}</p>
        </div>
        <UiToggle :model-value="settings.enabled" :label="t('adminPremium.enabled')" @update:model-value="(v) => ((settings!.enabled = v), touch())" />
      </div>

      <div class="mt-5 grid gap-5 lg:grid-cols-2">
        <fieldset class="min-w-0">
          <legend class="mb-2 text-xs font-bold uppercase tracking-wide text-secondary">{{ t("adminPremium.pricesLegend") }}</legend>
          <div class="grid grid-cols-2 gap-2">
            <label v-for="p in ['MONTHLY', 'YEARLY'] as const" :key="p" class="block min-w-0">
              <span class="label !text-xs">{{ p === "MONTHLY" ? t("premium.monthly") : t("premium.yearly") }} (USD)</span>
              <input type="number" step="0.01" min="0.5" :value="settings.plans[p].priceUsd" class="input" @input="(settings!.plans[p].priceUsd = num(($event.target as HTMLInputElement).value)), touch()" />
              <span class="mt-1 block truncate text-xs" :class="settings.plans[p].planId ? 'text-secondary' : 'text-orange'">
                {{ settings.plans[p].planId || t("adminPremium.noPlan") }}
              </span>
            </label>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <UiButton color="standard" size="sm" :disabled="!!busy || dirty || !summary.configured" @click="run('plans')">
              <RefreshCw :class="busy === 'plans' ? 'animate-spin' : ''" />{{ t("adminPremium.syncPlans") }}
            </UiButton>
            <span v-if="stale.length" class="text-xs font-semibold text-orange">{{ t("adminPremium.plansPending") }}</span>
          </div>
          <p class="mt-2 text-xs text-secondary">{{ t("adminPremium.syncPlansHint") }}</p>
        </fieldset>
        <fieldset class="min-w-0">
          <legend class="mb-2 text-xs font-bold uppercase tracking-wide text-secondary">{{ t("adminPremium.freeLegend") }}</legend>
          <div class="grid grid-cols-3 gap-2">
            <label class="block min-w-0">
              <span class="label !text-xs">{{ t("adminPremium.waitSec") }}</span>
              <input type="number" min="0" max="300" :value="settings.freeDownloadWaitSec" class="input" @input="(settings!.freeDownloadWaitSec = num(($event.target as HTMLInputElement).value)), touch()" />
            </label>
            <label class="block min-w-0">
              <span class="label !text-xs">{{ t("adminPremium.kbps") }}</span>
              <input type="number" min="50" :value="settings.freeDownloadKbps" class="input" @input="(settings!.freeDownloadKbps = num(($event.target as HTMLInputElement).value)), touch()" />
            </label>
            <label class="block min-w-0">
              <span class="label !text-xs">{{ t("adminPremium.sharePct") }}</span>
              <input type="number" min="0" max="90" :value="settings.premiumSharePct" class="input" @input="(settings!.premiumSharePct = num(($event.target as HTMLInputElement).value)), touch()" />
            </label>
          </div>
          <p class="mt-2 text-xs text-secondary">{{ t("adminPremium.freeHint") }}</p>
        </fieldset>
      </div>

      <div class="mt-5 rounded-xl border border-divider p-3 text-sm">
        <p class="font-bold text-contrast">{{ t("adminPremium.webhookTitle") }}</p>
        <p class="mt-0.5 text-xs text-secondary">{{ t("adminPremium.webhookHint") }}</p>
        <UiCopyField class="mt-2" :value="webhookUrl" :label="t('adminPremium.webhookTitle')" />
      </div>
    </DashCard>

    <DashCard :title="t('adminPremium.recentTitle')" :padded="false">
      <template #action>
        <UiButton color="standard" size="sm" :disabled="!!busy || !summary.configured" @click="run('subs')"><RefreshCw :class="busy === 'subs' ? 'animate-spin' : ''" />{{ t("adminPremium.syncSubs") }}</UiButton>
      </template>
      <div v-if="summary.recent.length" class="overflow-x-auto">
        <table class="w-full min-w-[560px] text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-xs font-bold uppercase tracking-wide text-secondary">
              <th class="px-5 py-2.5">Email</th>
              <th class="px-5 py-2.5">{{ t("premium.plan") }}</th>
              <th class="px-5 py-2.5">{{ t("premium.statusLabel") }}</th>
              <th class="px-5 py-2.5 text-right">{{ t("adminPremium.until") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in summary.recent" :key="s.providerSubscriptionId" class="border-b border-divider last:border-0">
              <td class="max-w-[220px] truncate px-5 py-3 font-semibold text-contrast" :title="s.providerSubscriptionId">{{ s.email }}</td>
              <td class="px-5 py-3 text-secondary">{{ s.plan === "YEARLY" ? t("premium.yearly") : t("premium.monthly") }}</td>
              <td class="px-5 py-3"><UiBadge :color="s.status === 'ACTIVE' ? 'brand' : s.status === 'SUSPENDED' ? 'orange' : 'gray'">{{ t.dynamic(`premium.status.${['ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'].includes(s.status) ? s.status : 'OTHER'}`) }}</UiBadge></td>
              <td class="px-5 py-3 text-right tabular-nums text-secondary">{{ s.premiumUntil ? fmt.formatDate(s.premiumUntil) : "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="px-5 pb-5 text-sm text-secondary">{{ t("adminPremium.noSubs") }}</p>
    </DashCard>
  </div>
</template>
