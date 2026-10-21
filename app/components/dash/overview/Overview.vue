<script setup lang="ts">
/**
 * Resumen del panel: KPIs del periodo frente al anterior, almacenamiento,
 * gráfica diaria (o tabla), más vistos, avisos y subidas recientes.
 */
import { CircleCheck, Clock, Database, Download, Eye, Film, Loader2, TriangleAlert, Upload } from "lucide-vue-next";

type Range = 7 | 30 | 90;
type Metric = "views" | "downloads";
interface Delta {
  kind: "new" | "flat" | "pct";
  pct?: number;
  dir: "up" | "down" | "flat";
}

const RANGES: Range[] = [7, 30, 90];

/** Variación del periodo actual frente al anterior de la misma duración. */
function delta(current: number, previous: number): Delta {
  if (previous === 0) return current > 0 ? { kind: "new", dir: "up" } : { kind: "flat", dir: "flat" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { kind: "flat", dir: "flat" };
  return { kind: "pct", pct, dir: pct > 0 ? "up" : "down" };
}

const d = useDashboard();
const { t } = useI18n();
const f = useFormat();

const range = ref<Range>(30);
const metric = ref<Metric>("views");
const showTable = ref(false);

// Se refresca al abrir el Resumen y cada minuto mientras está visible.
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void d.refreshStats();
  timer = setInterval(() => void d.refreshStats(), 60_000);
});
onBeforeUnmount(() => clearInterval(timer));

const m = computed(() => {
  const videos = d.videos.value;
  const stats = d.stats.value;
  const days = stats.days;
  const r = range.value;
  const cur = days.slice(-r);
  const prev = days.slice(-2 * r, -r);
  const sum = (list: typeof days, k: Metric) => list.reduce((s, x) => s + x[k], 0);
  const since = new Date(`${cur[0]?.date ?? "1970-01-01"}T00:00:00Z`).getTime();

  // Más vistos en el periodo
  const fromDate = cur[0]?.date ?? "";
  const top = stats.perVideo
    .map((pv) => {
      const inRange = pv.days.filter((x) => x.date >= fromDate);
      return { id: pv.id, views: inRange.reduce((s, x) => s + x.views, 0), downloads: inRange.reduce((s, x) => s + x.downloads, 0) };
    })
    .filter((x) => x.views + x.downloads > 0)
    .sort((a, b) => b.views - a.views || b.downloads - a.downloads)
    .slice(0, 5)
    .flatMap((x) => {
      const v = videos.find((y) => y.id === x.id);
      return v ? [{ ...x, video: v }] : [];
    });

  const live = videos.filter((v) => v.status !== "error");
  return {
    cur,
    views: sum(cur, "views"),
    downloads: sum(cur, "downloads"),
    viewsDelta: delta(sum(cur, "views"), sum(prev, "views")),
    downloadsDelta: delta(sum(cur, "downloads"), sum(prev, "downloads")),
    today: days[days.length - 1] ?? { views: 0, downloads: 0 },
    storage: live.reduce((s, v) => s + v.sizeBytes, 0),
    ready: videos.filter((v) => v.status === "ready").length,
    processing: videos.filter((v) => v.status === "processing" || v.status === "uploading").length,
    errors: videos.filter((v) => v.status === "error").length,
    content: videos.reduce((s, v) => s + (v.status === "ready" ? (v.durationSec ?? 0) : 0), 0),
    lifetimeViews: videos.reduce((s, v) => s + v.views, 0),
    lifetimeDownloads: videos.reduce((s, v) => s + v.downloads, 0),
    uploadedInRange: videos.filter((v) => new Date(v.createdAt).getTime() >= since).length,
    top,
  };
});

const attention = computed(() => d.videos.value.filter((v) => v.status !== "ready").slice(0, 5));
const recent = computed(() => [...d.videos.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5));
const quota = computed(() => d.stats.value.quotaBytes);
const quotaPct = computed(() => (quota.value ? Math.min(100, (m.value.storage / quota.value) * 100) : 0));
const chartData = computed(() => m.value.cur.map((x) => ({ date: x.date, value: x[metric.value] })));
const metricTotal = computed(() => (metric.value === "views" ? m.value.views : m.value.downloads));
const topMax = computed(() => Math.max(1, ...m.value.top.map((x) => x.views)));

const rangeOptions = computed(() => RANGES.map((r) => ({ value: r, label: t("overview.days", { count: r }) })));
const metricOptions = computed(() => [
  { value: "views" as Metric, label: t("overview.views") },
  { value: "downloads" as Metric, label: t("overview.downloads") },
]);
</script>

<template>
  <div :class="['space-y-5 transition-opacity', d.statsLoading.value ? 'opacity-70' : '']">
    <!-- Periodo: afecta a todo lo de abajo -->
    <div class="flex flex-wrap items-center gap-3">
      <UiSegmented v-model="range" :options="rangeOptions" :label="t('overview.period')" />
      <p class="text-sm text-secondary">{{ t("overview.compared", { count: range, updated: f.formatRelative(d.stats.value.generatedAt) }) }}</p>
    </div>

    <!-- KPIs principales -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <DashOverviewStatTile
        :icon="Eye"
        :label="t('overview.views')"
        :value="f.formatCount(m.views)"
        :delta="m.viewsDelta"
        :foot="t('overview.today', { value: f.formatCount(m.today.views) })"
        :trend="m.cur.map((x) => x.views)"
      />
      <DashOverviewStatTile
        :icon="Download"
        :label="t('overview.downloads')"
        :value="f.formatCount(m.downloads)"
        :delta="m.downloadsDelta"
        :foot="t('overview.today', { value: f.formatCount(m.today.downloads) })"
        :trend="m.cur.map((x) => x.downloads)"
      />

      <section class="min-w-0 rounded-2xl bg-raised p-5 shadow-card">
        <div class="flex items-center gap-2.5 text-sm font-bold text-secondary">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-button text-primary"><Database class="h-[18px] w-[18px]" /></span>
          {{ t("overview.storage") }}
        </div>
        <p class="mt-3 text-3xl font-extrabold tracking-tight text-contrast tabular-nums">{{ f.formatBytes(m.storage) }}</p>
        <template v-if="quota">
          <div
            class="mt-3 h-2.5 overflow-hidden rounded-full bg-button"
            role="meter"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="Math.round(quotaPct)"
            :aria-label="t('overview.storageUsage')"
          >
            <div :class="['h-full rounded-full', quotaPct >= 95 ? 'bg-red' : quotaPct >= 80 ? 'bg-orange' : 'bg-brand']" :style="{ width: `${Math.max(quotaPct, 1)}%` }" />
          </div>
          <p class="mt-2 text-sm text-secondary">
            {{ t("overview.quotaOf", { pct: Math.round(quotaPct), total: f.formatBytes(quota) }) }}
            <span v-if="quotaPct >= 80" class="font-bold text-orange"> · {{ t("overview.lowSpace") }}</span>
          </p>
        </template>
        <p v-else class="mt-3 text-sm text-secondary">{{ t("overview.unlimited") }}</p>
      </section>

      <section class="min-w-0 rounded-2xl bg-raised p-5 shadow-card">
        <div class="flex items-center gap-2.5 text-sm font-bold text-secondary">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-button text-primary"><Film class="h-[18px] w-[18px]" /></span>
          {{ t("overview.videos") }}
        </div>
        <p class="mt-3 text-3xl font-extrabold tracking-tight text-contrast tabular-nums">{{ f.formatCount(d.videos.value.length) }}</p>
        <ul class="mt-2.5 space-y-1.5 text-sm">
          <li class="flex items-center justify-between">
            <span class="inline-flex items-center gap-1.5 font-bold text-brand"><CircleCheck class="h-4 w-4" />{{ t("overview.ready") }}</span>
            <span class="font-semibold tabular-nums text-primary">{{ m.ready }}</span>
          </li>
          <li v-if="m.processing > 0" class="flex items-center justify-between">
            <span class="inline-flex items-center gap-1.5 font-bold text-orange"><Loader2 class="h-4 w-4 animate-spin" />{{ t("overview.processing") }}</span>
            <span class="font-semibold tabular-nums text-primary">{{ m.processing }}</span>
          </li>
          <li v-if="m.errors > 0" class="flex items-center justify-between">
            <span class="inline-flex items-center gap-1.5 font-bold text-red"><TriangleAlert class="h-4 w-4" />{{ t("overview.withError") }}</span>
            <span class="font-semibold tabular-nums text-primary">{{ m.errors }}</span>
          </li>
        </ul>
      </section>
    </div>

    <!-- Indicadores secundarios -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <DashOverviewMiniStat :icon="Clock" :label="t('overview.content')" :value="f.formatLongDuration(m.content)" />
      <DashOverviewMiniStat
        :icon="Eye"
        :label="t('overview.lifetimeViews')"
        :value="f.formatCount(m.lifetimeViews)"
        :hint="t('overview.lifetimeDownloads', { value: f.formatCount(m.lifetimeDownloads) })"
      />
      <DashOverviewMiniStat :icon="Upload" :label="t('overview.uploadedIn', { count: range })" :value="f.formatCount(m.uploadedInRange)" />
    </div>

    <!-- Gráfica diaria -->
    <DashCard :title="metric === 'views' ? t('overview.viewsPerDay') : t('overview.downloadsPerDay')" :subtitle="t('overview.totalInRange', { value: f.formatCount(metricTotal), count: range })">
      <template #action>
        <div class="flex flex-wrap items-center gap-2">
          <UiSegmented v-model="metric" :options="metricOptions" :label="t('overview.metric')" />
          <UiButton color="transparent" size="sm" :aria-pressed="showTable" @click="showTable = !showTable">
            {{ showTable ? t("overview.showChart") : t("overview.showTable") }}
          </UiButton>
        </div>
      </template>

      <div v-if="showTable" class="max-h-72 overflow-y-auto rounded-xl border border-divider">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-raised-2 text-left text-xs font-bold text-secondary">
            <tr>
              <th class="px-3 py-2">{{ t("overview.day") }}</th>
              <th class="px-3 py-2 text-right">{{ t("overview.views") }}</th>
              <th class="px-3 py-2 text-right">{{ t("overview.downloads") }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-divider tabular-nums">
            <tr v-for="x in [...m.cur].reverse()" :key="x.date">
              <td class="px-3 py-1.5 text-secondary">{{ f.formatDay(x.date, true) }}</td>
              <td class="px-3 py-1.5 text-right font-semibold text-contrast">{{ f.formatCount(x.views) }}</td>
              <td class="px-3 py-1.5 text-right font-semibold text-contrast">{{ f.formatCount(x.downloads) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <template v-else>
        <DashOverviewColumnChart
          :data="chartData"
          :unit="metric === 'views' ? t('overview.unitViews') : t('overview.unitDownloads')"
          :label="t('overview.chartLabel', { metric, count: range })"
        />
        <p v-if="metricTotal === 0" class="mt-2 text-center text-sm text-secondary">{{ t("overview.noData", { metric }) }}</p>
      </template>
    </DashCard>

    <div class="grid grid-cols-1 gap-5 xl:grid-cols-5">
      <!-- Más vistos -->
      <DashCard class="xl:col-span-3" :title="t('overview.topViewed')" :subtitle="t('overview.lastDays', { count: range })">
        <p v-if="m.top.length === 0" class="py-10 text-center text-sm text-secondary">{{ t("overview.noViewsYet") }}</p>
        <ol v-else class="space-y-1">
          <li v-for="(x, i) in m.top" :key="x.id">
            <button type="button" class="group flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left transition hover:bg-button" @click="d.actions.open(x.video)">
              <span class="w-4 shrink-0 text-sm font-extrabold tabular-nums text-secondary">{{ i + 1 }}</span>
              <span class="w-16 shrink-0 overflow-hidden rounded-lg sm:w-20"><DashVideoThumb :video="x.video" size="sm" /></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-bold text-contrast">{{ x.video.title }}</span>
                <span class="mt-1.5 block h-1.5 rounded-full bg-button">
                  <span class="block h-full rounded-full bg-brand" :style="{ width: `${(x.views / topMax) * 100}%` }" />
                </span>
              </span>
              <span class="w-16 shrink-0 text-right sm:w-24">
                <span class="block text-sm font-extrabold tabular-nums text-contrast">{{ f.formatCount(x.views) }}</span>
                <span class="block text-xs text-secondary">{{ t("overview.downloadsShort", { value: f.formatCount(x.downloads) }) }}</span>
              </span>
            </button>
          </li>
        </ol>
      </DashCard>

      <div class="min-w-0 space-y-5 xl:col-span-2">
        <!-- Requiere atención -->
        <DashCard v-if="attention.length > 0" :title="t('overview.attention')">
          <ul class="divide-y divide-divider">
            <li v-for="v in attention" :key="v.id" class="flex min-w-0 items-center gap-3 py-2.5">
              <span v-if="v.status === 'error'" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-soft text-red"><TriangleAlert class="h-4 w-4" /></span>
              <span v-else class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange"><Loader2 class="h-4 w-4 animate-spin" /></span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-bold text-contrast">{{ v.title }}</span>
                <span class="block text-xs text-secondary">
                  {{ v.status === "error" ? t("overview.attentionError") : v.status === "processing" ? t("overview.attentionProcessing") : t("overview.attentionIncomplete") }}
                </span>
              </span>
              <UiButton v-if="v.status === 'error'" color="transparent" size="sm" class="!text-red" @click="d.actions.remove(v)">{{ t("overview.delete") }}</UiButton>
            </li>
          </ul>
        </DashCard>

        <!-- Recientes -->
        <DashCard :title="t('overview.recent')">
          <template #action>
            <UiButton color="highlight" size="sm" @click="d.openUpload()"><Upload />{{ t("overview.upload") }}</UiButton>
          </template>
          <UiEmptyState v-if="recent.length === 0" :icon="Upload" :title="t('overview.noUploads')" class="!py-6" />
          <ul v-else class="space-y-1">
            <li v-for="v in recent" :key="v.id">
              <button type="button" class="flex w-full min-w-0 items-center gap-3 rounded-xl p-1.5 text-left transition hover:bg-button" @click="d.actions.open(v)">
                <span class="w-16 shrink-0 overflow-hidden rounded-lg"><DashVideoThumb :video="v" size="sm" /></span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-bold text-contrast">{{ v.title }}</span>
                  <span class="block truncate text-xs text-secondary">
                    {{ f.formatRelative(v.createdAt) }} · {{ t("overview.viewsCount", { count: v.views, value: f.formatCount(v.views) }) }}
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </DashCard>
      </div>
    </div>
  </div>
</template>
