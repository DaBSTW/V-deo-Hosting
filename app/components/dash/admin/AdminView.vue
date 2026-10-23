<script setup lang="ts">
/** Panel de administración: cierre mensual, verificaciones, pagos, ajustes de monetización y Monetag. */
import { CircleAlert, Coins, Lock, ShieldCheck, TriangleAlert, Wallet, BadgeCheck } from "lucide-vue-next";
import type { MonetizationSettings, PayoutMethod } from "#srv/monetization/settings";

interface Summary {
  liabilityMicros: number;
  monthViews: number;
  todayViews: number;
  pendingPayouts: { count: number; amountMicros: number };
  paidThisMonthMicros: number;
  topEarners: { email: string; views: number; creditedMicros: number }[];
}
interface AdminPayout {
  id: string;
  email: string;
  verifiedName: string | null;
  amountMicros: number;
  method: string;
  details: string;
  status: string;
  createdAt: string;
}
interface Verification {
  id: string;
  email: string;
  payout: string | null;
  fullName: string;
  birthDate: string;
  country: string;
  documentType: string;
  documentNumber: string;
  files: ("front" | "back" | "selfie")[];
  createdAt: string;
}

const METHODS: PayoutMethod[] = ["PAYPAL", "USDT_TRC20", "PAYONEER", "BANK"];
const DOC_TYPES = ["ID_CARD", "PASSPORT", "DRIVER_LICENSE"] as const;
const ageOf = (iso: string) => {
  const b = new Date(`${iso}T00:00:00Z`);
  const n = new Date();
  return (
    n.getUTCFullYear() -
    b.getUTCFullYear() -
    (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate()) ? 1 : 0)
  );
};

const d = useDashboard();
const dialogs = useDialogs();
const { t, locale } = useI18n();
const fmt = useFormat();

const settings = ref<MonetizationSettings | null>(null);
const summary = ref<Summary | null>(null);
const payouts = ref<AdminPayout[]>([]);
const kyc = ref<Verification[]>([]);
const viewer = ref<{ src: string; title: string } | null>(null);
const saving = ref(false);
const dirty = ref(false);

async function load() {
  try {
    const [a, p, k] = await Promise.all([
      api<{ settings: MonetizationSettings; summary: Summary }>("/api/admin/monetization"),
      api<{ payouts: AdminPayout[] }>("/api/admin/payouts"),
      api<{ verifications: Verification[] }>("/api/admin/kyc"),
    ]);
    settings.value = a.settings;
    summary.value = a.summary;
    payouts.value = p.payouts;
    kyc.value = k.verifications;
    dirty.value = false;
  } catch (err) {
    d.notify(d.errMsg(err));
  }
}
onMounted(load);

/** Cualquier cambio del formulario marca los ajustes como pendientes de guardar. */
const touch = () => (dirty.value = true);
const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));

const refreshSummary = () =>
  void api<{ settings: MonetizationSettings; summary: Summary }>("/api/admin/monetization").then((a) => (summary.value = a.summary));

async function save() {
  if (!settings.value) return;
  saving.value = true;
  try {
    const r = await api<{ settings: MonetizationSettings; summary: Summary }>("/api/admin/monetization", {
      method: "PUT",
      body: JSON.stringify(settings.value),
    });
    settings.value = r.settings;
    summary.value = r.summary;
    dirty.value = false;
    d.notify(t("admin.toast.saved"));
  } catch (err) {
    d.notify(d.errMsg(err));
  } finally {
    saving.value = false;
  }
}

async function act(p: AdminPayout, action: "approve" | "pay" | "reject", extra: { reference?: string; note?: string } = {}) {
  try {
    const r = await api<{ payouts: AdminPayout[] }>(`/api/admin/payouts/${p.id}`, { method: "PATCH", body: JSON.stringify({ action, ...extra }) });
    payouts.value = r.payouts;
    d.notify(t.dynamic(`admin.toast.payout_${action}`));
    refreshSummary();
    return true;
  } catch (err) {
    d.notify(d.errMsg(err));
    return false;
  }
}

async function review(v: Verification, action: "approve" | "reject", note?: string) {
  try {
    const r = await api<{ verifications: Verification[] }>(`/api/admin/kyc/${v.id}`, { method: "PATCH", body: JSON.stringify({ action, note }) });
    kyc.value = r.verifications;
    d.notify(action === "approve" ? t("admin.toast.kycApproved", { name: v.fullName }) : t("admin.toast.kycRejected"));
    void api<{ payouts: AdminPayout[] }>("/api/admin/payouts").then((x) => (payouts.value = x.payouts));
    return true;
  } catch (err) {
    d.notify(d.errMsg(err));
    return false;
  }
}

const rejectKyc = (v: Verification) =>
  dialogs.prompt({
    title: t("admin.kycRejectTitle", { name: v.fullName }),
    label: t("admin.kycRejectLabel"),
    confirmLabel: t("admin.reject"),
    onSubmit: (note) => review(v, "reject", note),
  });
const markPaid = (p: AdminPayout) =>
  dialogs.prompt({
    title: t("admin.markPaidTitle", { amount: fmt.formatMicros(p.amountMicros) }),
    label: t("admin.referenceLabel"),
    confirmLabel: t("admin.markPaid"),
    onSubmit: (reference) => act(p, "pay", { reference }),
  });
const rejectPayout = (p: AdminPayout) =>
  dialogs.prompt({
    title: t("admin.rejectPayoutTitle"),
    label: t("admin.rejectPayoutLabel"),
    confirmLabel: t("admin.reject"),
    onSubmit: (note) => act(p, "reject", { note }),
  });

async function copyDestination(p: AdminPayout) {
  try {
    await navigator.clipboard.writeText(p.details);
    d.notify(t("admin.toast.destinationCopied"));
  } catch {
    window.prompt(t("watch.copyPrompt"), p.details);
  }
}

const regionName = (c: string) => {
  try {
    return new Intl.DisplayNames([locale.value], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
};
const docLabel = (doc: string) => ((DOC_TYPES as readonly string[]).includes(doc) ? t.dynamic(`kyc.documentTypes.${doc}`) : doc);
const methodLabel = (m: string) => ((METHODS as string[]).includes(m) ? t.dynamic(`payoutMethods.${m}.label`) : m);
const methodCfg = (m: PayoutMethod) => {
  const s = settings.value!;
  if (!s.payoutMethods[m]) s.payoutMethods[m] = { enabled: false, minUsd: 25 };
  return s.payoutMethods[m]!;
};
</script>

<template>
  <div v-if="!settings || !summary" class="py-24 text-center text-sm font-semibold text-secondary">{{ t("common.loading") }}</div>
  <div v-else class="space-y-5">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <DashKpi accent :icon="Wallet" :label="t('admin.liability')" :value="fmt.formatMicros(summary.liabilityMicros)" :hint="t('admin.liabilityHint')" />
      <DashKpi
        :icon="CircleAlert"
        :label="t('admin.pendingPayouts')"
        :value="fmt.formatMicros(summary.pendingPayouts.amountMicros)"
        :hint="t('admin.requests', { count: summary.pendingPayouts.count })"
      />
      <DashKpi
        :icon="Coins"
        :label="t('admin.monthViews')"
        :value="fmt.formatCount(summary.monthViews)"
        :hint="t('admin.monthViewsHint', { today: fmt.formatCount(summary.todayViews) })"
      />
      <DashKpi :icon="Lock" :label="t('admin.paidMonth')" :value="fmt.formatMicros(summary.paidThisMonthMicros)" />
    </div>

    <DashAdminSettlement :share="settings.revenueSharePct" @closed="refreshSummary" />

    <DashAdminPremium />

    <DashAdminAccounts />

    <!-- Verificaciones de identidad -->

    <DashCard :title="t('admin.kycTitle')" :subtitle="t('admin.kycSubtitle')">
      <UiEmptyState v-if="kyc.length === 0" :icon="ShieldCheck" :title="t('admin.kycEmpty')" class="!py-8" />
      <ul v-else class="divide-y divide-divider">
        <li v-for="v in kyc" :key="v.id" class="grid gap-4 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div class="min-w-0">
            <p class="font-extrabold text-contrast">{{ v.fullName }}</p>
            <p class="truncate text-sm text-secondary">{{ t("admin.submitted", { email: v.email, date: fmt.formatDate(v.createdAt) }) }}</p>
            <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div class="min-w-0">
                <dt class="text-xs font-bold text-secondary">{{ t("admin.birth") }}</dt>
                <dd class="text-contrast">{{ t("admin.age", { date: v.birthDate, age: ageOf(v.birthDate) }) }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs font-bold text-secondary">{{ t("admin.country") }}</dt>
                <dd class="text-contrast">{{ regionName(v.country) }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs font-bold text-secondary">{{ docLabel(v.documentType) }}</dt>
                <dd class="truncate font-mono text-contrast">{{ v.documentNumber }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs font-bold text-secondary">{{ t("admin.payout") }}</dt>
                <dd class="truncate text-contrast" :title="v.payout ?? ''">{{ v.payout ?? "—" }}</dd>
              </div>
            </dl>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-for="f in v.files"
                :key="f"
                type="button"
                class="group relative h-20 w-28 overflow-hidden rounded-xl bg-button ring-1 ring-divider"
                :title="t('admin.enlarge')"
                @click="viewer = { src: `/api/admin/kyc/${v.id}/file/${f}`, title: `${v.fullName} · ${t(`admin.files.${f}`)}` }"
              >
                <img :src="`/api/admin/kyc/${v.id}/file/${f}`" :alt="t(`admin.files.${f}`)" class="h-full w-full object-cover transition group-hover:scale-105" />
                <span class="absolute bottom-1 left-1 rounded-md bg-black/75 px-1.5 text-[10px] font-bold text-white">{{ t(`admin.files.${f}`) }}</span>
              </button>
            </div>
          </div>
          <div class="flex items-start gap-2 lg:flex-col lg:items-stretch">
            <UiButton color="brand" size="sm" @click="review(v, 'approve')"><BadgeCheck />{{ t("admin.approve") }}</UiButton>
            <UiButton color="outline" size="sm" class="!text-red" @click="rejectKyc(v)">{{ t("admin.reject") }}</UiButton>
          </div>
        </li>
      </ul>
    </DashCard>

    <UiModal :open="!!viewer" :title="viewer?.title" size="xl" @close="viewer = null">
      <div v-if="viewer" class="flex justify-center px-5 pb-5">
        <img :src="viewer.src" :alt="viewer.title" class="max-h-[75vh] rounded-xl object-contain" />
      </div>
    </UiModal>

    <!-- Cola de pagos -->
    <DashCard :title="t('admin.pendingPayouts')" :subtitle="t('admin.payoutsSubtitle')">
      <UiEmptyState v-if="payouts.length === 0" :icon="Wallet" :title="t('admin.payoutsEmpty')" class="!py-8" />
      <div v-else class="-mx-5 overflow-x-auto px-5">
        <table class="w-full min-w-[760px] text-sm">
          <thead class="text-left text-xs font-bold text-secondary">
            <tr class="border-b border-divider">
              <th class="py-2.5 pr-3">{{ t("admin.table.user") }}</th>
              <th class="py-2.5 pr-3 text-right">{{ t("admin.table.amount") }}</th>
              <th class="py-2.5 pr-3">{{ t("admin.table.destination") }}</th>
              <th class="py-2.5 pr-3">{{ t("admin.table.requested") }}</th>
              <th class="py-2.5 pr-3">{{ t("admin.table.status") }}</th>
              <th class="py-2.5 text-right">{{ t("admin.table.actions") }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-divider">
            <tr v-for="p in payouts" :key="p.id">
              <td class="py-3 pr-3">
                <p class="font-bold text-contrast">{{ p.email }}</p>
                <p v-if="p.verifiedName" class="text-xs font-semibold text-brand">✓ {{ p.verifiedName }}</p>
                <p v-else class="text-xs font-semibold text-red">{{ t("admin.notVerified") }}</p>
              </td>
              <td class="py-3 pr-3 text-right font-extrabold tabular-nums text-contrast">{{ fmt.formatMicros(p.amountMicros) }}</td>
              <td class="py-3 pr-3">
                <p class="text-contrast">{{ methodLabel(p.method) }}</p>
                <button type="button" class="block max-w-[240px] truncate font-mono text-xs text-secondary hover:text-contrast" :title="t('common.copy')" @click="copyDestination(p)">
                  {{ p.details }}
                </button>
              </td>
              <td class="py-3 pr-3 text-secondary">{{ fmt.formatDate(p.createdAt) }}</td>
              <td class="py-3 pr-3"><DashPayoutBadge :status="p.status" /></td>
              <td class="py-3 text-right">
                <div class="flex justify-end gap-1.5">
                  <UiButton v-if="p.status === 'PENDING' && p.verifiedName" size="sm" @click="act(p, 'approve')">{{ t("admin.approve") }}</UiButton>
                  <UiButton size="sm" color="brand" :disabled="!p.verifiedName" @click="markPaid(p)">{{ t("admin.paidButton") }}</UiButton>
                  <UiButton size="sm" color="transparent" class="!text-red" @click="rejectPayout(p)">{{ t("admin.reject") }}</UiButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DashCard>

    <!-- Ajustes -->
    <DashCard :title="t('admin.settingsTitle')" :subtitle="t('admin.settingsSubtitle')">
      <template #action>
        <UiButton color="brand" :disabled="!dirty || saving" @click="save">
          {{ saving ? t("common.saving") : dirty ? t("admin.saveChanges") : t("admin.saved") }}
        </UiButton>
      </template>

      <div class="flex items-center justify-between gap-4 rounded-xl bg-button px-4 py-3">
        <div class="min-w-0">
          <p class="font-bold text-contrast">{{ t("admin.active") }}</p>
          <p class="text-sm text-secondary">{{ t("admin.activeHint") }}</p>
        </div>
        <UiToggle
          :model-value="settings.enabled"
          :label="t('admin.active')"
          @update:model-value="(v) => ((settings!.enabled = v), touch())"
        />
      </div>

      <div class="mt-5 grid gap-5 lg:grid-cols-2">
        <fieldset class="min-w-0">
          <legend class="mb-2 text-xs font-bold uppercase tracking-wide text-secondary">{{ t("admin.shareLegend") }}</legend>
          <label class="block max-w-[200px]">
            <span class="label !text-xs">{{ t("admin.sharePct") }}</span>
            <input
              type="number"
              step="1"
              min="1"
              max="90"
              :value="settings.revenueSharePct"
              class="input"
              @input="(settings!.revenueSharePct = num(($event.target as HTMLInputElement).value)), touch()"
            />
          </label>
          <p class="mt-2 text-xs text-secondary">{{ t("admin.shareHint") }}</p>
        </fieldset>
        <fieldset class="min-w-0">
          <legend class="mb-2 text-xs font-bold uppercase tracking-wide text-secondary">{{ t("admin.antifraudLegend") }}</legend>
          <div class="grid grid-cols-2 gap-2">
            <label class="block min-w-0">
              <span class="label !text-xs">{{ t("admin.minSeconds") }}</span>
              <input type="number" min="5" :value="settings.minWatchSeconds" class="input" @input="(settings!.minWatchSeconds = num(($event.target as HTMLInputElement).value)), touch()" />
            </label>
            <label class="block min-w-0">
              <span class="label !text-xs">{{ t("admin.ipCap") }}</span>
              <input type="number" min="1" :value="settings.perIpDailyCap" class="input" @input="(settings!.perIpDailyCap = num(($event.target as HTMLInputElement).value)), touch()" />
            </label>
          </div>
        </fieldset>
      </div>

      <fieldset class="mt-5">
        <legend class="mb-2 text-xs font-bold uppercase tracking-wide text-secondary">{{ t("admin.methodsLegend") }}</legend>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="m in METHODS" :key="m" class="rounded-xl border border-divider p-3">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-contrast">{{ t.dynamic(`payoutMethods.${m}.label`) }}</span>
              <UiToggle
                :model-value="methodCfg(m).enabled"
                :label="t.dynamic(`payoutMethods.${m}.label`)"
                @update:model-value="(v) => ((methodCfg(m).enabled = v), touch())"
              />
            </div>
            <label class="mt-2 block">
              <span class="label !text-xs !font-semibold !text-secondary">{{ t("admin.minimumUsd") }}</span>
              <input type="number" min="25" :value="methodCfg(m).minUsd" class="input" @input="(methodCfg(m).minUsd = num(($event.target as HTMLInputElement).value)), touch()" />
            </label>
          </div>
        </div>
      </fieldset>
    </DashCard>

    <!-- Monetag -->
    <DashCard title="Monetag" :subtitle="t('admin.monetagSubtitle')">
      <ol class="mb-5 list-decimal space-y-1.5 pl-5 text-sm text-primary marker:font-bold marker:text-brand">
        <li>{{ t("admin.monetagStep1") }}</li>
        <li>
          <IntlText k="admin.monetagStep2" :values="{ meta: '<meta>' }">
            <template #code="{ text }"><code class="rounded-md bg-button px-1.5 py-0.5 font-mono text-xs text-contrast">{{ text }}</code></template>
          </IntlText>
        </li>
        <li>{{ t("admin.monetagStep3") }}</li>
        <li>{{ t("admin.monetagStep4") }}</li>
      </ol>
      <div class="space-y-4">
        <label class="block">
          <span class="label">{{ t("admin.monetagMeta", { tag: "<meta …>" }) }}</span>
          <input v-model="settings.monetagMetaTag" placeholder='<meta name="monetag" content="…">' class="input font-mono !text-xs" @input="touch" />
        </label>
        <label class="block">
          <span class="label">{{ t("admin.monetagSnippet") }}</span>
          <textarea v-model="settings.monetagPlayerSnippet" rows="5" placeholder="<script>…</script>" class="input font-mono !text-xs" @input="touch" />
        </label>
        <!-- Anuncios del reproductor: pre-roll VAST y popunder -->
        <fieldset class="rounded-2xl border border-divider p-4">
          <legend class="px-1 text-sm font-extrabold text-contrast">{{ t("admin.playerAds.title") }}</legend>
          <p class="mb-3 text-xs text-secondary">{{ t("admin.playerAds.hint") }}</p>
          <label class="block">
            <span class="label">{{ t("admin.playerAds.vast") }}</span>
            <input v-model.trim="settings.vastTagUrl" type="url" placeholder="https://…/vast.xml?…" class="input font-mono !text-xs" @input="touch" />
          </label>
          <div class="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
            <label class="block min-w-0">
              <span class="label !text-xs">{{ t("admin.playerAds.skipAfter") }}</span>
              <input type="number" min="0" max="60" :value="settings.vastSkipAfterSec" class="input" @input="(settings!.vastSkipAfterSec = num(($event.target as HTMLInputElement).value)), touch()" />
            </label>
            <label class="block min-w-0">
              <span class="label !text-xs">{{ t("admin.playerAds.vastEvery") }}</span>
              <input type="number" min="0" max="1440" :value="settings.vastEveryMin" class="input" @input="(settings!.vastEveryMin = num(($event.target as HTMLInputElement).value)), touch()" />
            </label>
          </div>
          <label class="mt-4 block">
            <span class="label">{{ t("admin.playerAds.popunder") }}</span>
            <input v-model.trim="settings.popunderUrl" type="url" placeholder="https://…" class="input font-mono !text-xs" @input="touch" />
          </label>
          <div class="mt-3 flex flex-wrap items-end gap-4">
            <label class="block w-full sm:max-w-[220px]">
              <span class="label !text-xs">{{ t("admin.playerAds.popunderEvery") }}</span>
              <input type="number" min="1" max="1440" :value="settings.popunderEveryMin" class="input" @input="(settings!.popunderEveryMin = num(($event.target as HTMLInputElement).value)), touch()" />
            </label>
            <label class="flex items-center gap-2.5 pb-2 text-sm font-semibold text-contrast">
              <UiToggle :model-value="settings.popunderOnDownload" :label="t('admin.playerAds.onDownload')" @update:model-value="(v) => ((settings!.popunderOnDownload = v), touch())" />
              {{ t("admin.playerAds.onDownload") }}
            </label>
          </div>
          <p class="mt-3 text-xs text-secondary">{{ t("admin.playerAds.note") }}</p>
        </fieldset>
        <label class="block">
          <span class="label">{{ t("admin.monetagSw") }}</span>
          <textarea v-model="settings.monetagServiceWorker" rows="3" placeholder="self.options = { … }; importScripts(…)" class="input font-mono !text-xs" @input="touch" />
        </label>
        <p class="flex items-start gap-2.5 rounded-xl bg-orange-soft px-3.5 py-3 text-sm font-semibold text-orange">
          <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
          {{ t("admin.monetagWarning") }}
        </p>
      </div>
    </DashCard>

    <!-- Revisión antifraude -->
    <DashCard :title="t('admin.topEarners')" :subtitle="t('admin.topEarnersSubtitle')">
      <p v-if="summary.topEarners.length === 0" class="py-6 text-center text-sm text-secondary">{{ t("admin.noActivity") }}</p>
      <div v-else class="-mx-5 overflow-x-auto px-5">
        <table class="w-full min-w-[420px] text-sm">
          <thead class="text-left text-xs font-bold text-secondary">
            <tr class="border-b border-divider">
              <th class="py-2.5">{{ t("admin.table.user") }}</th>
              <th class="py-2.5 text-right">{{ t("admin.table.monetizedViews") }}</th>
              <th class="py-2.5 text-right">{{ t("admin.table.generated") }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-divider tabular-nums">
            <tr v-for="x in summary.topEarners" :key="x.email">
              <td class="max-w-[240px] truncate py-2.5 text-contrast">{{ x.email }}</td>
              <td class="py-2.5 text-right text-primary">{{ fmt.formatCount(x.views) }}</td>
              <td class="py-2.5 text-right font-extrabold text-contrast">{{ fmt.formatMicros(x.creditedMicros) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DashCard>
  </div>
</template>
