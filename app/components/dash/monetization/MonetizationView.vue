<script setup lang="ts">
/** Sección «Monetización» del usuario: saldo, ganancias, tarifas, cobro e historial. */
import { Check, CircleAlert, Clock, Coins, Lock, ShieldCheck, TriangleAlert, Wallet } from "lucide-vue-next";
import type { MonetizationOverview } from "#srv/monetization/earnings";

const d = useDashboard();
const { confirm } = useDialogs();
const { t } = useI18n();
const fmt = useFormat();

const data = ref<MonetizationOverview | null>(null);
const metric = ref<"amount" | "views">("amount");
const method = ref("");
const details = ref("");
const saving = ref(false);
const kycOpen = ref(false);

async function load() {
  try {
    const res = await api<MonetizationOverview>("/api/monetization");
    data.value = res;
    method.value = res.payout.method ?? res.methods[0]?.id ?? "";
    details.value = res.payout.details ?? "";
  } catch (err) {
    d.notify(d.errMsg(err));
  }
}
onMounted(load);

const METHOD_IDS = ["PAYPAL", "USDT_TRC20", "PAYONEER", "BANK"];
const methodLabel = (id: string) => (METHOD_IDS.includes(id) ? t.dynamic(`payoutMethods.${id}.label`) : id);

async function toggle(enabled: boolean) {
  try {
    data.value = await api<MonetizationOverview>("/api/monetization", { method: "PATCH", body: JSON.stringify({ monetizationEnabled: enabled }) });
    d.notify(enabled ? t("monetization.toast.enabled") : t("monetization.toast.disabled"));
  } catch (err) {
    d.notify(d.errMsg(err));
  }
}

async function savePayout() {
  saving.value = true;
  try {
    data.value = await api<MonetizationOverview>("/api/monetization", {
      method: "PATCH",
      body: JSON.stringify({ payoutMethod: method.value, payoutDetails: details.value }),
    });
    d.notify(t("monetization.toast.methodSaved"));
  } catch (err) {
    d.notify(d.errMsg(err));
  } finally {
    saving.value = false;
  }
}

function requestPayout() {
  const cur = data.value;
  if (!cur) return;
  // Primer cobro sin identidad verificada → se pide la verificación.
  if (cur.canRequest.needsKyc) return (kycOpen.value = true);
  confirm({
    title: t("monetization.requestPayout"),
    message: t("monetization.confirmPayout", {
      amount: fmt.formatMicros(cur.balance.availableMicros),
      method: methodLabel(cur.payout.method ?? ""),
      details: cur.payout.details ?? "",
    }),
    confirmLabel: t("monetization.requestPayout"),
    onConfirm: async () => {
      try {
        data.value = await api<MonetizationOverview>("/api/monetization/payouts", { method: "POST" });
        d.notify(t("monetization.toast.payoutRequested"));
      } catch (err) {
        d.notify(d.errMsg(err));
      }
    },
  });
}

function onKycSubmitted() {
  kycOpen.value = false;
  d.notify(t("monetization.toast.kycSent"));
  void load();
}

const reasonText = computed(() => {
  const cur = data.value;
  const r = cur?.canRequest.reason;
  if (!cur || !r) return t("monetization.readyToCashOut");
  return r === "belowMinimum"
    ? t("monetization.reasons.belowMinimum", { method: methodLabel(cur.payout.method ?? ""), min: fmt.formatUsd(cur.canRequest.minUsd ?? 0) })
    : t.dynamic(`monetization.reasons.${r}`);
});

const selected = computed(() => data.value?.methods.find((m) => m.id === method.value));
const totalTierViews = computed(() => data.value?.byTier.reduce((s, x) => s + x.views, 0) ?? 0);
const paidCount = computed(() => data.value?.payouts.filter((p) => p.status === "PAID").length ?? 0);
const dailyAmount = computed(() => data.value?.daily.reduce((s, x) => s + x.amountMicros, 0) ?? 0);
const dailyViews = computed(() => data.value?.daily.reduce((s, x) => s + x.views, 0) ?? 0);
const metricOptions = computed(() => [
  { value: "amount" as const, label: t("monetization.earnings") },
  { value: "views" as const, label: t("monetization.monetizedViews") },
]);

// Tarjeta de verificación de identidad
const kycText = computed(() => {
  const k = data.value?.kyc;
  if (!k) return "";
  if (k.status === "PENDING") return t("monetization.kycCard.pendingText", { when: k.submittedAt ? fmt.formatRelative(k.submittedAt) : "" });
  if (k.status === "APPROVED")
    return k.fullName ? t("monetization.kycCard.approvedTextName", { name: k.fullName }) : t("monetization.kycCard.approvedText");
  if (k.status === "REJECTED")
    return k.note ? t("monetization.kycCard.rejectedTextReason", { reason: k.note }) : t("monetization.kycCard.rejectedText");
  return t("monetization.kycCard.noneText");
});
const KYC_COLOR = { NONE: "gray", PENDING: "orange", APPROVED: "brand", REJECTED: "red" } as const;
</script>

<template>
  <div v-if="!data" class="py-24 text-center text-sm font-semibold text-secondary">{{ t("monetization.loading") }}</div>
  <div v-else class="space-y-5">
    <div v-if="!data.platformEnabled" class="flex flex-wrap items-start gap-3 rounded-2xl border border-orange/30 bg-orange-soft px-4 py-3.5 text-sm">
      <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-orange" />
      <div class="min-w-0 flex-1">
        <p class="font-bold text-contrast">{{ t("monetization.platformOff") }}</p>
        <p class="mt-0.5 text-primary">{{ t("monetization.platformOffHint") }}</p>
      </div>
      <UiButton v-if="d.user.isAdmin" size="sm" @click="d.changeFilter({ kind: 'admin' })">{{ t("monetization.configure") }}</UiButton>
    </div>

    <!-- Saldo -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <DashKpi accent :icon="Wallet" :label="t('monetization.available')" :value="fmt.formatMicros(data.balance.availableMicros)" :hint="reasonText">
        <UiButton color="brand" block class="mt-4" :disabled="!data.canRequest.ok && !data.canRequest.needsKyc" @click="requestPayout">
          {{ t("monetization.requestPayout") }}
        </UiButton>
      </DashKpi>
      <DashKpi
        :icon="Lock"
        :label="t('monetization.held')"
        :value="fmt.formatMicros(data.balance.heldMicros)"
        :hint="t('monetization.heldHint', { days: data.rules.holdDays })"
      />
      <DashKpi
        :icon="Coins"
        :label="t('monetization.month')"
        :value="fmt.formatMicros(data.balance.monthMicros)"
        :hint="t('monetization.lifetime', { amount: fmt.formatMicros(data.balance.lifetimeMicros) })"
      />
      <DashKpi :icon="Check" :label="t('monetization.paid')" :value="fmt.formatMicros(data.balance.paidMicros)" :hint="t('monetization.paidCount', { count: paidCount })" />
    </div>

    <!-- Interruptor -->
    <DashCard>
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <h2 class="text-lg font-extrabold text-contrast">{{ t("monetization.monetizeTitle") }}</h2>
          <p class="mt-0.5 text-sm text-secondary">{{ t("monetization.monetizeHint") }}</p>
        </div>
        <UiToggle :model-value="data.userEnabled" :label="t('monetization.monetizeTitle')" @update:model-value="toggle" />
      </div>
    </DashCard>

    <!-- Verificación de identidad -->
    <DashCard>
      <div class="flex flex-wrap items-center gap-4">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-highlight text-brand"><ShieldCheck class="h-5 w-5" /></span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-extrabold text-contrast">{{ t("monetization.kycCard.title") }}</h2>
            <UiBadge :color="KYC_COLOR[data.kyc.status]">{{ t(`monetization.kycCard.status.${data.kyc.status}`) }}</UiBadge>
          </div>
          <p class="mt-0.5 text-sm text-secondary">{{ kycText }}</p>
        </div>
        <UiButton v-if="data.kyc.status === 'NONE' || data.kyc.status === 'REJECTED'" color="brand" @click="kycOpen = true">
          {{ data.kyc.status === "NONE" ? t("monetization.kycCard.verifyNow") : t("monetization.kycCard.resend") }}
        </UiButton>
      </div>
    </DashCard>
    <DashMonetizationKycDialog :open="kycOpen" :first-payout="data.canRequest.needsKyc" @close="kycOpen = false" @submitted="onKycSubmitted" />

    <!-- Gráfica -->
    <DashCard
      :title="metric === 'amount' ? t('monetization.earningsPerDay') : t('monetization.viewsPerDay')"
      :subtitle="
        t('monetization.last30', {
          value:
            metric === 'amount'
              ? fmt.formatMicros(dailyAmount)
              : t('monetization.viewsValue', { count: dailyViews, value: fmt.formatCount(dailyViews) }),
        })
      "
    >
      <template #action>
        <UiSegmented v-model="metric" :options="metricOptions" :label="t('monetization.metric')" />
      </template>
      <DashMonetizationChart
        v-if="metric === 'amount'"
        :data="data.daily.map((x) => ({ date: x.date, value: x.amountMicros / 1e6 }))"
        :label="t('monetization.earningsPerDay')"
        :format="(n: number) => fmt.formatUsd(n)"
        :integer="false"
      />
      <DashMonetizationChart
        v-else
        :data="data.daily.map((x) => ({ date: x.date, value: x.views }))"
        :unit="t('monetization.viewsUnit')"
        :label="t('monetization.viewsPerDay')"
      />
    </DashCard>

    <div class="grid grid-cols-1 gap-5 xl:grid-cols-5">
      <!-- Tarifas -->
      <DashCard class="xl:col-span-3" :title="t('monetization.ratesTitle')" :subtitle="t('monetization.ratesSubtitle')">
        <div class="-mx-5 overflow-x-auto px-5">
          <table class="w-full min-w-[480px] text-sm">
            <thead class="text-left text-xs font-bold uppercase tracking-wide text-secondary">
              <tr class="border-b border-divider">
                <th class="py-2 pr-3">{{ t("monetization.table.tier") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("monetization.table.rate") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("monetization.table.views") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("monetization.table.traffic") }}</th>
                <th class="py-2 text-right">{{ t("monetization.table.earned") }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-divider tabular-nums">
              <tr v-for="x in data.byTier" :key="x.tier">
                <td class="py-3 pr-3">
                  <p class="font-bold text-contrast">{{ t("tiers.label", { n: x.tier.slice(1) }) }}</p>
                  <p class="max-w-[260px] truncate text-xs text-secondary" :title="x.countries ? x.countries.join(', ') : t('tiers.rest')">
                    {{ x.countries ? x.countries.join(", ") : t("tiers.rest") }}
                  </p>
                </td>
                <td class="py-3 pr-3 text-right font-bold text-contrast">{{ fmt.formatUsd(x.rateUsd) }}</td>
                <td class="py-3 pr-3 text-right text-primary">{{ fmt.formatCount(x.views) }}</td>
                <td class="py-3 pr-3 text-right text-secondary">{{ totalTierViews ? `${Math.round((x.views / totalTierViews) * 100)} %` : "—" }}</td>
                <td class="py-3 text-right font-bold text-contrast">{{ fmt.formatMicros(x.amountMicros) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DashCard>

      <!-- Videos que más generan -->
      <DashCard class="xl:col-span-2" :title="t('monetization.topVideos')" :subtitle="t('monetization.topVideosSubtitle')">
        <p v-if="data.topVideos.length === 0" class="py-8 text-center text-sm text-secondary">{{ t("monetization.noMonetizedViews") }}</p>
        <ol v-else class="space-y-3.5">
          <li v-for="(v, i) in data.topVideos" :key="v.id" class="flex items-center gap-3">
            <span class="w-4 text-xs font-extrabold tabular-nums text-secondary">{{ i + 1 }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-bold text-contrast">{{ v.title }}</span>
              <span class="mt-1.5 block h-1.5 rounded-full bg-button">
                <span class="block h-full rounded-full bg-brand" :style="{ width: `${(v.paidViews / data.topVideos[0]!.paidViews) * 100}%` }" />
              </span>
            </span>
            <span class="text-sm font-extrabold tabular-nums text-contrast">{{ fmt.formatCount(v.paidViews) }}</span>
          </li>
        </ol>
      </DashCard>
    </div>

    <div class="grid grid-cols-1 gap-5 xl:grid-cols-5">
      <!-- Método de cobro -->
      <DashCard class="xl:col-span-2" :title="t('monetization.payoutMethod')" :subtitle="t('monetization.payoutMethodSubtitle')">
        <p v-if="data.methods.length === 0" class="text-sm text-secondary">{{ t("monetization.noMethods") }}</p>
        <form v-else class="space-y-4" @submit.prevent="savePayout">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="m in data.methods"
              :key="m.id"
              type="button"
              :aria-pressed="method === m.id"
              :class="[
                'min-w-0 rounded-xl border px-3 py-2.5 text-left transition',
                method === m.id ? 'border-brand bg-brand-highlight' : 'border-divider bg-button hover:border-secondary',
              ]"
              @click="method = m.id"
            >
              <span :class="['block truncate text-sm font-bold', method === m.id ? 'text-brand' : 'text-contrast']">{{ t.dynamic(`payoutMethods.${m.id}.label`) }}</span>
              <span class="block text-xs text-secondary">{{ t("monetization.minimum", { min: fmt.formatUsd(m.minUsd) }) }}</span>
            </button>
          </div>
          <label v-if="selected" class="block">
            <span class="label">{{ t.dynamic(`payoutMethods.${selected.id}.details`) }}</span>
            <input v-model="details" :placeholder="t.dynamic(`payoutMethods.${selected.id}.placeholder`)" class="input" />
          </label>
          <UiButton type="submit" color="brand" block :disabled="saving || !details.trim()">
            {{ saving ? t("common.saving") : t("monetization.saveMethod") }}
          </UiButton>
        </form>
      </DashCard>

      <!-- Historial -->
      <DashCard class="xl:col-span-3" :title="t('monetization.history')">
        <p v-if="data.payouts.length === 0" class="py-8 text-center text-sm text-secondary">{{ t("monetization.noPayouts") }}</p>
        <div v-else class="-mx-5 overflow-x-auto px-5">
          <table class="w-full min-w-[480px] text-sm">
            <thead class="text-left text-xs font-bold uppercase tracking-wide text-secondary">
              <tr class="border-b border-divider">
                <th class="py-2 pr-3">{{ t("monetization.table.date") }}</th>
                <th class="py-2 pr-3">{{ t("monetization.table.method") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("monetization.table.amount") }}</th>
                <th class="py-2">{{ t("monetization.table.status") }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-divider">
              <tr v-for="p in data.payouts" :key="p.id">
                <td class="py-3 pr-3 text-primary">{{ fmt.formatDate(p.createdAt) }}</td>
                <td class="py-3 pr-3 font-semibold text-contrast">{{ methodLabel(p.method) }}</td>
                <td class="py-3 pr-3 text-right font-bold tabular-nums text-contrast">{{ fmt.formatMicros(p.amountMicros) }}</td>
                <td class="py-3">
                  <DashPayoutBadge :status="p.status" />
                  <p v-if="p.reference" class="mt-1 max-w-[200px] truncate text-[11px] text-secondary" :title="p.reference">
                    {{ t("monetization.reference", { ref: p.reference }) }}
                  </p>
                  <p v-if="p.note" class="mt-1 max-w-[200px] truncate text-[11px] text-red" :title="p.note">{{ p.note }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DashCard>
    </div>

    <!-- Reglas -->
    <DashCard :title="t('monetization.rulesTitle')">
      <ul class="grid gap-3 text-sm text-primary sm:grid-cols-2">
        <li class="flex gap-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-highlight text-brand"><Clock class="h-4 w-4" /></span>
          <span class="pt-1.5">{{ t("monetization.rules.watch", { seconds: data.rules.minWatchSeconds }) }}</span>
        </li>
        <li class="flex gap-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-highlight text-brand"><ShieldCheck class="h-4 w-4" /></span>
          <span class="pt-1.5">{{ t("monetization.rules.unique", { cap: data.rules.perIpDailyCap }) }}</span>
        </li>
        <li class="flex gap-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-highlight text-brand"><CircleAlert class="h-4 w-4" /></span>
          <span class="pt-1.5">{{ t("monetization.rules.excluded") }}</span>
        </li>
        <li class="flex gap-3">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-highlight text-brand"><Lock class="h-4 w-4" /></span>
          <span class="pt-1.5">{{ t("monetization.rules.hold", { days: data.rules.holdDays }) }}</span>
        </li>
      </ul>
    </DashCard>
  </div>
</template>
