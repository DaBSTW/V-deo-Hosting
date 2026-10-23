<script setup lang="ts">
/** /v/:publicId — enlace directo para compartir: reproductor, descarga e inserción. */
import { Check, Clock, Code, Crown, Download, Globe, Link as LinkIcon } from "lucide-vue-next";

const route = useRoute();
const { t } = useI18n();
const fmt = useFormat();
const appName = useAppName();
const data = await usePublicVideo(String(route.params.publicId));

useHead(() => ({ title: data.value.title, meta: [{ name: "robots", content: "noindex, nofollow" }] }));

const embedOpen = ref(false);
const copied = ref(false);
async function copyLink() {
  try {
    await navigator.clipboard.writeText(data.value.watchUrl);
  } catch {
    window.prompt(t("watch.copyPrompt"), data.value.watchUrl);
    return;
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1800);
}
const qualityLabel = (o: { kind: string; height: number | null }) =>
  o.kind === "original" ? (o.height ? t("watch.originalHeight", { height: o.height }) : t("watch.original")) : o.kind === "single" ? "MP4" : `${o.height}p`;
</script>

<template>
  <div class="mx-auto grid max-w-[1280px] grid-cols-1 gap-5 px-4 pb-16 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div class="min-w-0 space-y-5">
      <div class="aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-card">
        <PlayerVideoPlayer
          v-if="data.state === 'ready'"
          :source="data.source"
          :title="data.title"
          :view-url="data.viewUrl"
          :qualify-after-sec="data.monetization?.qualifyAfterSec"
          :appearance="data.player"
          :intro="data.intro"
          :resume-key="data.publicId"
        />
        <PlayerMessage v-else :title="data.title" :kind="data.state" :message="data.state === 'processing' ? t('player.processing') : t('player.unavailable')" />
      </div>

      <section class="card">
        <h1 class="break-words text-2xl font-extrabold leading-tight text-contrast sm:text-3xl">{{ data.title }}</h1>
        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-secondary">
          <span v-if="data.state === 'ready' && data.durationSec" class="inline-flex items-center gap-1.5"><Clock class="h-4 w-4" />{{ fmt.formatDuration(data.durationSec) }}</span>
          <span class="inline-flex items-center gap-1.5"><Globe class="h-4 w-4" />{{ t("ui.poweredBy", { app: appName }) }}</span>
        </div>
        <div v-if="data.state === 'ready'" class="mt-5 flex flex-wrap items-center gap-2 border-t border-divider pt-5">
          <WatchDownloadButton
            v-if="data.downloads.length"
            :public-id="data.publicId"
            :options="data.downloads"
            :premium="data.viewer.premium"
            :wait-sec="data.offer?.waitSec"
            :speed-limit="data.offer?.speedLimit"
          />
          <UiButton :color="embedOpen ? 'highlight' : 'standard'" :aria-expanded="embedOpen" @click="embedOpen = !embedOpen"><Code />{{ t("watch.embed") }}</UiButton>
          <UiButton :color="copied ? 'highlight' : 'standard'" @click="copyLink">
            <component :is="copied ? Check : LinkIcon" />
            {{ copied ? t("watch.copied") : t("watch.copyLink") }}
          </UiButton>
        </div>
      </section>

      <WatchEmbedPanel v-if="embedOpen && data.state === 'ready'" :embed-url="data.embedUrl" :title="data.title" />
      <PremiumPromo v-if="data.state === 'ready' && data.offer" variant="slim" :monthly-usd="data.offer.monthlyUsd" :yearly-usd="data.offer.yearlyUsd" :speed-limit="data.offer.speedLimit" class="lg:hidden" />
    </div>

    <aside class="min-w-0 space-y-5">
      <PremiumPromo v-if="data.state === 'ready' && data.offer" :monthly-usd="data.offer.monthlyUsd" :yearly-usd="data.offer.yearlyUsd" :speed-limit="data.offer.speedLimit" class="max-lg:hidden" />
      <div v-else-if="data.state === 'ready' && data.viewer.premium" class="flex items-center gap-2 rounded-2xl bg-premium-soft px-4 py-3 text-sm font-semibold text-contrast">
        <Crown class="h-4 w-4 text-premium" />{{ t("premium.viewerActive") }}
      </div>
      <section class="card">
        <h2 class="mb-4 text-lg font-extrabold text-contrast">{{ t("ui.details") }}</h2>
        <dl class="space-y-3 text-sm">
          <div v-if="data.state === 'ready' && data.durationSec" class="flex items-center justify-between gap-3">
            <dt class="flex items-center gap-2 font-semibold text-secondary"><Clock class="h-4 w-4" />{{ t("ui.duration") }}</dt>
            <dd class="font-bold text-contrast">{{ fmt.formatDuration(data.durationSec) }}</dd>
          </div>
          <template v-if="data.state === 'ready' && data.downloads.length">
            <div class="flex items-center gap-2 pt-1 font-semibold text-secondary"><Download class="h-4 w-4" />{{ t("ui.qualities") }}</div>
            <div class="flex flex-wrap gap-1.5">
              <UiBadge v-for="o in data.downloads" :key="o.id" :dot="false">{{ qualityLabel(o) }}<template v-if="o.sizeBytes"> · {{ fmt.formatBytes(o.sizeBytes) }}</template></UiBadge>
            </div>
          </template>
        </dl>
      </section>
      <section class="card">
        <h2 class="mb-3 text-lg font-extrabold text-contrast">{{ t("ui.share") }}</h2>
        <UiCopyField :value="data.watchUrl" :label="t('ui.share')" />
      </section>
      <section class="card relative overflow-hidden">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_80%_at_100%_0%,var(--hero-glow),transparent)]" />
        <div class="relative">
          <SiteLogo />
          <p class="mt-3 text-sm text-secondary">{{ t("ui.footerTagline") }}</p>
          <UiButton to="/" color="brand" size="sm" class="mt-4">{{ t("landing.hero.primary") }}</UiButton>
        </div>
      </section>
    </aside>
  </div>
</template>
