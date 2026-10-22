<script setup lang="ts">
/**
 * Cierre mensual (reparto de ingresos): el admin copia de Monetag el RPM real
 * de cada país, revisa la vista previa y acredita el % de los creadores.
 */
import { CalendarCheck, Calculator, ClipboardPaste, Crown, Lock, TriangleAlert } from "lucide-vue-next";
import type { SettlementPreview } from "#srv/monetization/settlement";

const props = defineProps<{ share: number }>();
const emit = defineEmits<{ closed: [] }>();
const d = useDashboard();
const { confirm } = useDialogs();
const { t, locale } = useI18n();
const fmt = useFormat();

interface Overview {
  current: { month: string; views: number };
  pending: { month: string; views: number }[];
  closed: { month: string; sharePct: number; views: number; creditedMicros: number; revenueMicros: number | null; scale: number; legacy: boolean; premiumCreditedMicros: number; premiumViews: number; closedAt: string }[];
}
interface MonthDetail {
  month: string;
  sharePct: number;
  countries: { country: string; views: number; users: number }[];
}

const overview = ref<Overview | null>(null);
const month = ref<string | null>(null);
const detail = ref<MonthDetail | null>(null);
const rpm = reactive<Record<string, string>>({});
const defaultRpm = ref("");
const revenue = ref("");
const pasteOpen = ref(false);
const pasteText = ref("");
const preview = ref<SettlementPreview | null>(null);
const previewKey = ref("");
const busy = ref(false);

const monthLabel = (m: string) =>
  new Intl.DateTimeFormat(locale.value, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
const regionNames = computed(() => new Intl.DisplayNames([locale.value], { type: "region" }));
const countryName = (code: string) => {
  if (code === "XX") return t("admin.settlement.unknown");
  try {
    return regionNames.value.of(code) ?? code;
  } catch {
    return code;
  }
};
const toNum = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

async function loadOverview() {
  try {
    overview.value = await api<Overview>("/api/admin/settlements");
    const first = overview.value.pending[0]?.month ?? null;
    if (!month.value || !overview.value.pending.some((p) => p.month === month.value)) month.value = first;
  } catch (err) {
    d.notify(d.errMsg(err));
  }
}

watch(month, async (m) => {
  detail.value = null;
  preview.value = null;
  for (const k of Object.keys(rpm)) delete rpm[k];
  defaultRpm.value = "";
  revenue.value = "";
  if (!m) return;
  try {
    detail.value = await api<MonthDetail>(`/api/admin/settlements/${m}`);
  } catch (err) {
    d.notify(d.errMsg(err));
  }
});
onMounted(loadOverview);

/** Cuerpo de la petición con los valores del formulario. */
const body = computed(() => {
  const map: Record<string, number> = {};
  for (const [c, v] of Object.entries(rpm)) {
    const n = toNum(v);
    if (n != null && Number.isFinite(n)) map[c] = n;
  }
  return { rpm: map, defaultRpm: toNum(defaultRpm.value) ?? 0, revenue: toNum(revenue.value) };
});
const bodyKey = computed(() => JSON.stringify(body.value));
const stale = computed(() => !preview.value || previewKey.value !== bodyKey.value);
const creditOf = computed(() => new Map(preview.value?.rows.map((r) => [r.country, r.creditedMicros]) ?? []));

/** «MX 1.50», «MX,1.50», «MX\t1.50» o «México (MX) 1,50». */
function applyPaste() {
  let count = 0;
  for (const line of pasteText.value.split(/\r?\n/)) {
    const code = /\b([A-Z]{2})\b/.exec(line)?.[1];
    const value = /(\d+(?:[.,]\d+)?)\s*$/.exec(line.trim())?.[1];
    if (!code || !value) continue;
    rpm[code] = value.replace(",", ".");
    count++;
  }
  d.notify(t("admin.settlement.pasteResult", { count }));
  pasteOpen.value = false;
  pasteText.value = "";
}

async function calculate() {
  if (!month.value) return;
  busy.value = true;
  try {
    preview.value = await api<SettlementPreview>(`/api/admin/settlements/${month.value}`, { method: "POST", body: JSON.stringify(body.value) });
    previewKey.value = bodyKey.value;
  } catch (err) {
    d.notify(d.errMsg(err));
  } finally {
    busy.value = false;
  }
}

function close() {
  const m = month.value;
  const p = preview.value;
  if (!m || !p) return;
  confirm({
    title: t("admin.settlement.confirmTitle", { month: monthLabel(m) }),
    message: t("admin.settlement.confirmText", { amount: fmt.formatMicros(p.creditedMicros + p.premium.creditedMicros), count: p.creators }),
    confirmLabel: t("admin.settlement.close", { month: monthLabel(m) }),
    onConfirm: async () => {
      try {
        await api(`/api/admin/settlements/${m}`, { method: "POST", body: JSON.stringify({ ...body.value, confirm: true }) });
        d.notify(t("admin.settlement.closedToast", { month: monthLabel(m) }));
        month.value = null;
        await loadOverview();
        emit("closed");
      } catch (err) {
        d.notify(d.errMsg(err));
      }
    },
  });
}

const platformMicros = computed(() => {
  const p = preview.value;
  if (!p) return 0;
  const base = body.value.revenue != null ? Math.round(body.value.revenue * 1e6) : p.grossMicros;
  return Math.max(0, base - p.creditedMicros);
});
</script>

<template>
  <DashCard :title="t('admin.settlement.title')" :subtitle="t('admin.settlement.subtitle', { share: props.share })">
    <template #action>
      <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-on-brand"><CalendarCheck class="h-5 w-5" /></span>
    </template>

    <div v-if="!overview" class="py-8 text-center text-sm text-secondary">{{ t("common.loading") }}</div>
    <template v-else>
      <p v-if="!overview.pending.length" class="rounded-xl bg-button px-4 py-3 text-sm text-primary">
        {{ t("admin.settlement.none", { month: monthLabel(overview.current.month) }) }}
      </p>

      <template v-else>
        <!-- Meses pendientes -->
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in overview.pending"
            :key="p.month"
            type="button"
            :aria-pressed="month === p.month"
            :class="[
              'rounded-xl border px-3.5 py-2 text-left transition',
              month === p.month ? 'border-brand bg-brand-highlight' : 'border-divider bg-button hover:border-secondary',
            ]"
            @click="month = p.month"
          >
            <span :class="['block text-sm font-bold first-letter:uppercase', month === p.month ? 'text-brand' : 'text-contrast']">{{ monthLabel(p.month) }}</span>
            <span class="block text-xs text-secondary">{{ fmt.formatCount(p.views) }} {{ t("admin.settlement.views").toLowerCase() }}</span>
          </button>
        </div>

        <div v-if="detail" class="mt-5 space-y-5">
          <p v-if="!detail.countries.length" class="text-sm text-secondary">{{ t("admin.settlement.empty") }}</p>
          <template v-else>
            <!-- RPM por país -->
            <div class="flex flex-wrap items-center justify-between gap-2">
              <UiButton size="sm" :color="pasteOpen ? 'highlight' : 'standard'" @click="pasteOpen = !pasteOpen"><ClipboardPaste />{{ t("admin.settlement.paste") }}</UiButton>
            </div>
            <div v-if="pasteOpen" class="rounded-2xl bg-button p-4">
              <textarea v-model="pasteText" rows="5" :placeholder="t('admin.settlement.pastePlaceholder')" class="input font-mono text-xs" />
              <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p class="text-xs text-secondary">{{ t("admin.settlement.pasteHint") }}</p>
                <UiButton size="sm" color="brand" :disabled="!pasteText.trim()" @click="applyPaste">{{ t("admin.settlement.pasteApply") }}</UiButton>
              </div>
            </div>

            <div class="-mx-5 overflow-x-auto px-5">
              <table class="w-full min-w-[560px] text-sm">
                <thead class="text-left text-xs font-bold uppercase tracking-wide text-secondary">
                  <tr class="border-b border-divider">
                    <th class="py-2 pr-3">{{ t("admin.settlement.country") }}</th>
                    <th class="py-2 pr-3 text-right">{{ t("admin.settlement.views") }}</th>
                    <th class="py-2 pr-3 text-right">{{ t("admin.settlement.creators") }}</th>
                    <th class="py-2 pr-3">{{ t("admin.settlement.rpm") }}</th>
                    <th class="py-2 text-right">{{ t("admin.settlement.credit") }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-divider tabular-nums">
                  <tr v-for="c in detail.countries" :key="c.country">
                    <td class="py-2 pr-3">
                      <span class="flex items-center gap-2.5">
                        <span class="rounded-md bg-button px-1.5 py-0.5 font-mono text-[11px] font-bold text-secondary">{{ c.country }}</span>
                        <span class="truncate font-semibold text-contrast">{{ countryName(c.country) }}</span>
                      </span>
                    </td>
                    <td class="py-2 pr-3 text-right text-primary">{{ fmt.formatCount(c.views) }}</td>
                    <td class="py-2 pr-3 text-right text-secondary">{{ c.users }}</td>
                    <td class="py-2 pr-3">
                      <input
                        v-model="rpm[c.country]"
                        inputmode="decimal"
                        :placeholder="defaultRpm || '0.00'"
                        :aria-label="`${t('admin.settlement.rpm')} · ${c.country}`"
                        class="input !h-9 !w-28 text-right"
                      />
                    </td>
                    <td class="py-2 text-right font-bold text-contrast">{{ preview ? fmt.formatMicros(creditOf.get(c.country) ?? 0) : "—" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="label">{{ t("admin.settlement.defaultRpm") }}</span>
                <input v-model="defaultRpm" inputmode="decimal" placeholder="0.00" class="input" />
              </label>
              <label class="block">
                <span class="label">{{ t("admin.settlement.revenue") }}</span>
                <input v-model="revenue" inputmode="decimal" placeholder="—" class="input" />
                <span class="mt-1 block text-xs text-secondary">{{ t("admin.settlement.revenueHint", { share: props.share }) }}</span>
              </label>
            </div>

            <!-- Vista previa -->
            <div v-if="preview" class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-2xl bg-button px-4 py-3">
                <p class="text-xs font-bold text-secondary">{{ t("admin.settlement.gross") }}</p>
                <p class="mt-1 text-xl font-extrabold tabular-nums text-contrast">{{ fmt.formatMicros(preview.grossMicros) }}</p>
              </div>
              <div class="rounded-2xl border-2 border-brand bg-brand-soft px-4 py-3">
                <p class="text-xs font-bold text-brand">{{ t("admin.settlement.credited", { share: preview.sharePct }) }}</p>
                <p class="mt-1 text-xl font-extrabold tabular-nums text-contrast">{{ fmt.formatMicros(preview.creditedMicros) }}</p>
              </div>
              <div class="rounded-2xl bg-button px-4 py-3">
                <p class="text-xs font-bold text-secondary">{{ t("admin.settlement.platform") }}</p>
                <p class="mt-1 text-xl font-extrabold tabular-nums text-contrast">{{ fmt.formatMicros(platformMicros) }}</p>
              </div>
            </div>
            <!-- Bolsa de Premium (independiente del RPM de Monetag) -->
            <div v-if="preview && (preview.premium.revenueMicros > 0 || preview.premium.views > 0)" class="flex flex-wrap items-center gap-3 rounded-2xl bg-premium-soft px-4 py-3 text-sm">
              <Crown class="h-5 w-5 shrink-0 text-premium" />
              <p class="min-w-0 flex-1 text-primary">
                {{ t("admin.settlement.premiumPool", { revenue: fmt.formatMicros(preview.premium.revenueMicros), pct: preview.premium.sharePct, views: fmt.formatCount(preview.premium.views), creators: preview.premium.creators }) }}
              </p>
              <p class="font-extrabold tabular-nums text-contrast">{{ fmt.formatMicros(preview.premium.creditedMicros) }}</p>
            </div>
            <p v-if="preview && preview.scale < 1" class="flex items-start gap-2 rounded-xl bg-orange-soft px-4 py-3 text-sm font-semibold text-orange">
              <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
              {{ t("admin.settlement.capApplied", { pct: Math.round(preview.scale * 1000) / 10, share: preview.sharePct }) }}
            </p>

            <div class="flex flex-wrap justify-end gap-2">
              <UiButton :disabled="busy" @click="calculate"><Calculator />{{ t("admin.settlement.preview") }}</UiButton>
              <UiButton color="brand" :disabled="busy || stale || !month" @click="close"><Lock />{{ t("admin.settlement.close", { month: monthLabel(month!) }) }}</UiButton>
            </div>
          </template>
        </div>
      </template>

      <!-- Historial -->
      <div v-if="overview.closed.length" class="mt-6 border-t border-divider pt-5">
        <h3 class="mb-2 text-sm font-extrabold text-contrast">{{ t("admin.settlement.history") }}</h3>
        <div class="-mx-5 overflow-x-auto px-5">
          <table class="w-full min-w-[480px] text-sm">
            <thead class="text-left text-xs font-bold uppercase tracking-wide text-secondary">
              <tr class="border-b border-divider">
                <th class="py-2 pr-3">{{ t("admin.settlement.month") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("admin.settlement.views") }}</th>
                <th class="py-2 pr-3 text-right">{{ t("admin.settlement.credit") }}</th>
                <th class="py-2" />
              </tr>
            </thead>
            <tbody class="divide-y divide-divider tabular-nums">
              <tr v-for="c in overview.closed" :key="c.month">
                <td class="py-2.5 pr-3 font-semibold first-letter:uppercase text-contrast">{{ monthLabel(c.month) }}</td>
                <td class="py-2.5 pr-3 text-right text-primary">{{ fmt.formatCount(c.views) }}</td>
                <td class="py-2.5 pr-3 text-right font-bold text-contrast">
                  {{ fmt.formatMicros(c.creditedMicros + c.premiumCreditedMicros) }}
                  <span v-if="c.premiumCreditedMicros" class="block text-xs font-semibold text-premium">{{ t("admin.settlement.premiumPart", { amount: fmt.formatMicros(c.premiumCreditedMicros) }) }}</span>
                </td>
                <td class="py-2.5">
                  <span class="flex flex-wrap justify-end gap-1.5">
                    <UiBadge v-if="c.legacy" :dot="false">{{ t("admin.settlement.legacy") }}</UiBadge>
                    <UiBadge v-else color="brand" :dot="false">{{ c.sharePct }} %</UiBadge>
                    <UiBadge v-if="c.scale < 1" color="orange" :dot="false">{{ t("admin.settlement.scale", { pct: Math.round((1 - c.scale) * 1000) / 10 }) }}</UiBadge>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </DashCard>
</template>
