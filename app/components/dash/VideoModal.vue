<script setup lang="ts">
/** Detalle rápido: vista previa real del embed + códigos para copiar. */
import { Clock, ExternalLink, FastForward, Pencil, Trash2 } from "lucide-vue-next";

const { t } = useI18n();
const fmt = useFormat();
const d = useDashboard();
const video = computed(() => d.videos.value.find((v) => v.id === d.openId.value) ?? null);
const ready = computed(() => video.value?.status === "ready");
const close = () => (d.openId.value = null);

// ----- Saltar intro
const frame = ref<HTMLIFrameElement>();
const introStart = ref<number | null>(null);
const introEnd = ref<number | null>(null);
const savingIntro = ref(false);
watch(
  () => [video.value?.id, video.value?.intro?.start, video.value?.intro?.end],
  () => {
    introStart.value = video.value?.intro?.start ?? null;
    introEnd.value = video.value?.intro?.end ?? null;
  },
  { immediate: true },
);
const introDirty = computed(() => introStart.value !== (video.value?.intro?.start ?? null) || introEnd.value !== (video.value?.intro?.end ?? null));
/** El reproductor de la vista previa es del mismo dominio: se puede leer su tiempo actual. */
function markNow(which: "start" | "end") {
  try {
    const t0 = frame.value?.contentDocument?.querySelector("video")?.currentTime;
    if (t0 == null) return;
    if (which === "start") introStart.value = Math.floor(t0);
    else introEnd.value = Math.ceil(t0);
  } catch {
    /* otro dominio: no disponible */
  }
}
async function saveIntro() {
  if (!video.value) return;
  const empty = introEnd.value == null;
  savingIntro.value = true;
  await d.actions.setIntro(video.value, empty ? null : { start: introStart.value ?? 0, end: introEnd.value! });
  savingIntro.value = false;
}
async function clearIntro() {
  if (!video.value) return;
  introStart.value = introEnd.value = null;
  if (video.value.intro) await d.actions.setIntro(video.value, null);
}
</script>

<template>
  <UiModal :open="!!video" :title="video?.title" size="xl" @close="close">
    <div v-if="video" class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div class="px-5 pb-5 lg:pr-0">
        <div class="overflow-hidden rounded-2xl bg-black">
          <iframe
            v-if="ready"
            ref="frame"
            :key="video.id"
            :src="video.embedUrl"
            :title="video.title"
            class="aspect-video w-full"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowfullscreen
          />
          <DashVideoThumb v-else :video="video" />
        </div>
      </div>

      <div class="space-y-5 px-5 pb-5">
        <dl class="grid grid-cols-2 gap-3">
          <div class="rounded-xl bg-button px-3 py-2.5">
            <dt class="text-xs font-bold text-secondary">{{ t("video.modal.status") }}</dt>
            <dd class="mt-1"><DashStatusBadge :status="video.status" /></dd>
          </div>
          <div class="rounded-xl bg-button px-3 py-2.5">
            <dt class="text-xs font-bold text-secondary">{{ t("video.modal.duration") }}</dt>
            <dd class="mt-1 font-bold text-contrast">{{ fmt.formatDuration(video.durationSec) }}</dd>
          </div>
          <div class="rounded-xl bg-button px-3 py-2.5">
            <dt class="text-xs font-bold text-secondary">{{ t("video.modal.size") }}</dt>
            <dd class="mt-1 font-bold text-contrast">{{ fmt.formatBytes(video.sizeBytes) }}</dd>
          </div>
          <div class="rounded-xl bg-button px-3 py-2.5">
            <dt class="text-xs font-bold text-secondary">{{ t("video.modal.uploaded") }}</dt>
            <dd class="mt-1 truncate font-bold text-contrast">{{ fmt.formatDate(video.createdAt) }}</dd>
          </div>
        </dl>

        <label class="block">
          <span class="label">{{ t("video.modal.folder") }}</span>
          <select
            :value="video.folderId ?? ''"
            class="input cursor-pointer"
            @change="d.actions.move([video.id], ($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">{{ t("video.modal.noFolder") }}</option>
            <option v-for="f in d.folders.value" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>

        <div class="flex items-center justify-between gap-4 rounded-2xl bg-button px-4 py-3">
          <span>
            <span class="block text-sm font-bold text-contrast">{{ t("video.modal.allowDownload") }}</span>
            <span class="block text-xs text-secondary">{{ t("video.modal.allowDownloadHint") }}</span>
          </span>
          <UiToggle :model-value="video.allowDownload" :label="t('video.modal.allowDownload')" @update:model-value="(v) => d.actions.setAllowDownload(video!, v)" />
        </div>

        <DashVideoSubtitles :video-id="video.id" />

        <!-- Saltar intro -->
        <div class="rounded-2xl bg-button px-4 py-3">
          <div class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-1.5 text-sm font-bold text-contrast"><FastForward class="h-4 w-4" />{{ t("video.intro.title") }}</span>
            <UiBadge :color="video.intro ? 'brand' : 'gray'" :dot="false">{{ video.intro ? t("video.intro.own") : t("video.intro.default") }}</UiBadge>
          </div>
          <div class="mt-2.5 grid grid-cols-2 gap-2">
            <div class="min-w-0">
              <span class="mb-1 block text-xs font-semibold text-secondary">{{ t("video.intro.from") }}</span>
              <div class="flex gap-1">
                <DashTimeInput v-model="introStart" :label="t('video.intro.from')" class="!bg-raised" />
                <UiButton v-if="ready" size="sm" color="transparent" icon-only class="!h-9 shrink-0" :title="t('video.intro.now')" :aria-label="t('video.intro.now')" @click="markNow('start')"><Clock /></UiButton>
              </div>
            </div>
            <div class="min-w-0">
              <span class="mb-1 block text-xs font-semibold text-secondary">{{ t("video.intro.to") }}</span>
              <div class="flex gap-1">
                <DashTimeInput v-model="introEnd" :label="t('video.intro.to')" placeholder="1:30" class="!bg-raised" />
                <UiButton v-if="ready" size="sm" color="transparent" icon-only class="!h-9 shrink-0" :title="t('video.intro.now')" :aria-label="t('video.intro.now')" @click="markNow('end')"><Clock /></UiButton>
              </div>
            </div>
          </div>
          <p class="mt-2 text-xs text-secondary">{{ t("video.intro.hint") }}</p>
          <div class="mt-2.5 flex flex-wrap gap-2">
            <UiButton size="sm" color="brand" :disabled="!introDirty || savingIntro" @click="saveIntro">{{ t("common.save") }}</UiButton>
            <UiButton v-if="video.intro || introStart != null || introEnd != null" size="sm" color="transparent" @click="clearIntro">{{ t("video.intro.clear") }}</UiButton>
          </div>
        </div>

        <div :class="ready ? '' : 'pointer-events-none opacity-50'">
          <span class="label">{{ t("video.modal.embedCode") }}</span>
          <UiCopyField :value="video.iframe" :label="t('video.modal.embedCode')" multiline />
        </div>
        <div :class="ready ? '' : 'pointer-events-none opacity-50'">
          <span class="label">{{ t("video.modal.directLink") }}</span>
          <UiCopyField :value="video.watchUrl" :label="t('video.modal.directLink')" />
        </div>

        <div class="flex flex-wrap gap-2 border-t border-divider pt-4">
          <UiButton size="sm" @click="d.actions.rename(video)"><Pencil />{{ t("video.modal.rename") }}</UiButton>
          <UiButton v-if="ready" size="sm" :href="video.watchUrl" target="_blank" rel="noopener"><ExternalLink />{{ t("video.modal.open") }}</UiButton>
          <UiButton size="sm" color="red" @click="d.actions.remove(video)"><Trash2 />{{ t("video.modal.delete") }}</UiButton>
        </div>
      </div>
    </div>
  </UiModal>
</template>
