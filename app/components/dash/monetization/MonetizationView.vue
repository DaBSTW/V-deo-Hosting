<script setup lang="ts">
/**
 * Sección «Monetización» del usuario (reparto de ingresos): saldo acreditado,
 * mes en curso con estimación, ganancias por mes y país, cobro e historial.
 */
import { BadgeCheck, CalendarCheck, CalendarClock, Check, CircleAlert, Clock, Crown, HandCoins, Lock, ShieldCheck, TriangleAlert, Wallet } from "lucide-vue-next";
import type { MonetizationOverview } from "#srv/monetization/earnings";

const d = useDashboard();
const { confirm } = useDialogs();
const { t, locale } = useI18n();
const fmt = useFormat();

const data = ref<MonetizationOverview | null>(null);
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
const paidCount = computed(() => data.value?.payouts.filter((p) => p.status === "PAID").length ?? 0);
const dailyViews = computed(() => data.value?.daily.reduce((s, x) => s + x.views, 0) ?? 0);
const countryViews = computed(() => data.value?.countries.reduce((s, x) => s + x.views, 0) ?? 0);
const share = computed(() => data.value?.rules.sharePct ?? 30);
const viewsText = (n: number) => t("monetization.currentViews", { count: n, value: fmt.formatCount(n) });

/** «octubre de 2026» a partir de "2026-10". */
const monthLabel = (m: string) =>
  new Intl.DateTimeFormat(locale.value, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const regionNames = computed(() => new Intl.DisplayNames([locale.value], { type: "region" }));
const countryName = (code: string) => {
  if (code === "XX") return t("monetization.unknownCountry");
  try {
    return regionNames.value.of(code) ?? code;
  } catch {
    return code;
  }
};
/** Ejemplo ilustrativo del reparto (RPM real de 1,50 $ en México). */
const example = computed(() => ({ rpm: fmt.formatUsd(1.5), creator: fmt.formatUsd((1.5 * share.value) / 100) }));
const MONTH_COLOR = { open: "blue", pending: "orange", credited: "brand" } as const;

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
        :icon="CalendarClock"
        :label="t('monetization.currentMonth')"
        :value="data.current.estimateMicros != null ? `≈ ${fmt.formatMicros(data.current.estimateMicros)}` : fmt.formatCount(data.current.views)"
        :hint="
          data.current.estimateMicros != null && data.current.estimateFrom
            ? `${viewsText(data.current.views)} · ${t('monetization.estimateHint', { month: monthLabel(data.current.estimateFrom) })}`
            : `${viewsText(data.current.views)} · ${t('monetization.noEstimate')}`
        "
      />
      <DashKpi
        :icon="CalendarCheck"
        :label="t('monetization.lastClosed')"
        :value="data.lastClosed ? fmt.formatMicros(data.lastClosed.amountMicros) : '—'"
        :hint="
          data.lastClosed
            ? t('monetization.lastClosedHint', { month: monthLabel(data.lastClosed.month), views: viewsText(data.lastClosed.views) })
            : t('monetization.noClosed')
        "
      />
      <DashKpi
        :icon="Check"
        :label="t('monetization.paid')"
        :value="fmt.formatMicros(data.balance.paidMicros)"
        :hint="`${t('monetization.paidCount', { count: paidCount })} · ${t('monetization.credited', { amount: fmt.formatMicros(data.balance.creditedMicros) })}`"
      />
    </div>

    <!-- Estado (siempre activa; solo el operador puede suspenderla) -->
    <DashCard>
      <div class="flex items-center gap-4">
        <span :class="['flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', data.userEnabled ? 'bg-brand-highlight text-brand' : 'bg-red-soft text-red']">
          <component :is="data.userEnabled ? BadgeCheck : CircleAlert" class="h-5 w-5" />
        </span>
        <div class="min-w-0">
          <h2 class="text-lg font-extrabold text-contrast">{{ data.userEnabled ? t("monetization.monetizeTitle") : t("monetization.suspendedTitle") }}</h2>
          <p class="mt-0.5 text-sm text-secondary">{{ data.userEnabled ? t("monetization.monetizeHint") : t("monetization.suspendedHint") }}</p>
        </div>
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

    <!-- Reparto de ingresos + mes en curso por país -->
    <div class="grid grid-cols-1 gap-5 xl:grid-cols-5">
      <DashCard class="relative overflow-hidden xl:col-span-2">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_80%_at_100%_0%,var(--hero-glow),transparent)]" />
        <div class="relative">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-on-brand"><HandCoins class="h-5 w-5" /></span>
          <h2 class="mt-4 text-xl font-extrabold text-contrast">{{ t("monetization.shareTitle", { share }) }}</h2>
          <p class="mt-2 text-sm leading-relaxed text-primary">{{ t("monetization.shareText", { share }) }}</p>
          <p class="mt-4 rounded-xl bg-button px-4 py-3 text-sm font-semibold text-contrast">{{ t("monetization.shareExample", example) }}</p>
          <p v-if="data.premium.sharePct > 0" class="mt-3 flex items-start gap-2 rounded-xl bg-premium-soft px-4 py-3 text-sm text-primary">
            <Crown class="mt-0.5 h-4 w-4 shrink-0 text-premium" />
            <span>{{ t("monetization.premiumShare", { pct: data.premium.sharePct, views: fmt.formatCount(data.premium.currentViews) }) }}</span>
          </p>
        </div>
      </DashCard>

      <DashCard
        class="xl:col-span-3"
        :title="t('monetization.countriesTitle')"
        :subtitle="data.current.estimateFrom ? t('monetization.countriesSubtitle', { month: monthLabel(data.current.estimateFrom) }) : t('monetization.countriesSubtitleNoRpm')"
      >
        <p v-if="data.countries.length === 0" class="py-8 text-center text-sm text-secondary">{{ t("monetization.noMonetizedViews") }}</p>
        <div v-else class="-mx-5 overflow-x-auto px-5">
          <table class="w-full min-w-[420px] text-sm">
            <thead class="text-left text-xs font-bold uppercase tracking-wide text-secondary">
              <tr class="border-b border-divider">
                <th class="py-2 pr-3">{{ t("monetization.table.country") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("monetization.table.views") }}</th>
                <th v-if="data.current.estimateFrom" class="py-2 pr-3 text-right">{{ t("monetization.table.creatorRpm") }}</th>
                <th v-if="data.current.estimateFrom" class="py-2 text-right">{{ t("monetization.table.estimate") }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-divider tabular-nums">
              <tr v-for="c in data.countries" :key="c.country">
                <td class="py-2.5 pr-3">
                  <span class="flex items-center gap-2.5">
                    <span class="rounded-md bg-button px-1.5 py-0.5 font-mono text-[11px] font-bold text-secondary">{{ c.country }}</span>
                    <span class="truncate font-semibold text-contrast">{{ countryName(c.country) }}</span>
                  </span>
                  <span class="mt-1.5 block h-1 rounded-full bg-button">
                    <span class="block h-full rounded-full bg-brand" :style="{ width: `${countryViews ? (c.views / countryViews) * 100 : 0}%` }" />
                  </span>
                </td>
                <td class="py-2.5 pr-3 text-right font-semibold text-primary">{{ fmt.formatCount(c.views) }}</td>
                <td v-if="data.current.estimateFrom" class="py-2.5 pr-3 text-right text-primary">{{ c.creatorRpmMicros != null ? fmt.formatMicros(c.creatorRpmMicros, true) : "—" }}</td>
                <td v-if="data.current.estimateFrom" class="py-2.5 text-right font-bold text-contrast">
                  {{ c.creatorRpmMicros != null ? `≈ ${fmt.formatMicros(Math.floor((c.views * c.creatorRpmMicros) / 1000))}` : "—" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DashCard>
    </div>

    <!-- Vistas monetizadas por día -->
    <DashCard
      :title="t('monetization.viewsPerDay')"
      :subtitle="t('monetization.last30', { value: t('monetization.viewsValue', { count: dailyViews, value: fmt.formatCount(dailyViews) }) })"
    >
      <DashMonetizationChart :data="data.daily.map((x) => ({ date: x.date, value: x.views }))" :unit="t('monetization.viewsUnit')" :label="t('monetization.viewsPerDay')" />
    </DashCard>

    <div class="grid grid-cols-1 gap-5 xl:grid-cols-5">
      <!-- Ganancias por mes -->
      <DashCard class="xl:col-span-3" :title="t('monetization.monthsTitle')" :subtitle="t('monetization.monthsSubtitle')">
        <div class="-mx-5 overflow-x-auto px-5">
          <table class="w-full min-w-[420px] text-sm">
            <thead class="text-left text-xs font-bold uppercase tracking-wide text-secondary">
              <tr class="border-b border-divider">
                <th class="py-2 pr-3">{{ t("monetization.table.month") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("monetization.table.views") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("monetization.table.amount") }}</th>
                <th class="py-2">{{ t("monetization.table.status") }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-divider tabular-nums">
              <tr v-for="m in data.months" :key="m.month">
                <td class="py-3 pr-3 font-semibold first-letter:uppercase text-contrast">{{ monthLabel(m.month) }}</td>
                <td class="py-3 pr-3 text-right text-primary">{{ fmt.formatCount(m.views) }}</td>
                <td class="py-3 pr-3 text-right font-bold text-contrast">
                  {{ m.amountMicros != null ? fmt.formatMicros(m.amountMicros) : "—" }}
                  <span v-if="m.premiumMicros" class="block text-xs font-semibold text-premium">{{ t("monetization.premiumPart", { amount: fmt.formatMicros(m.premiumMicros) }) }}</span>
                </td>
                <td class="py-3"><UiBadge :color="MONTH_COLOR[m.status]">{{ t(`monetization.monthStatus.${m.status}`) }}</UiBadge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </DashCard>

      <!-- Videos con más vistas monetizadas -->
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
          <span class="pt-1.5">{{ t("monetization.rules.settlement") }}</span>
        </li>
      </ul>
    </DashCard>
  </div>
</template>
