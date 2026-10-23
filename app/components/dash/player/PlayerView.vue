<script setup lang="ts">
/**
 * Panel → Reproductor: personaliza el reproductor de todos tus videos (en el
 * enlace directo y en los insertados), con vista previa en vivo.
 */
import { Check, ChevronsRight, Code, Image as ImageIcon, MonitorPlay, Palette, Play, RotateCcw, Type } from "lucide-vue-next";
import { DEFAULT_PLAYER, WATERMARK_POSITIONS, contrastOn, resolveIntro, type PlayerSettings } from "#shared/lib/player-settings";
import type { PublicPlayback } from "~/types/video";

const d = useDashboard();
const { t } = useI18n();
const settings = ref<PlayerSettings | null>(null);
const saved = ref("");
const colors = ref<string[]>([]);
const saving = ref(false);
const mode = ref<"embed" | "page">("embed");
const embedMode = computed(() => mode.value === "embed");
const preview = ref<Extract<PublicPlayback, { state: "ready" }> | null>(null);

const dirty = computed(() => !!settings.value && JSON.stringify(settings.value) !== saved.value);

onMounted(async () => {
  try {
    const res = await api<{ settings: PlayerSettings; colors: string[] }>("/api/player");
    settings.value = res.settings;
    saved.value = JSON.stringify(res.settings);
    colors.value = res.colors;
  } catch (err) {
    d.notify(d.errMsg(err));
  }
  // Vista previa con tu primer video listo (sin contar vistas: no se pasa viewUrl).
  const first = d.videos.value.find((v) => v.status === "ready");
  if (first) preview.value = await api<PublicPlayback>(`/api/public/videos/${first.id}`).then((p) => (p.state === "ready" ? p : null)).catch(() => null);
});

async function save() {
  if (!settings.value) return;
  saving.value = true;
  try {
    const res = await api<{ settings: PlayerSettings }>("/api/player", { method: "PUT", body: JSON.stringify(settings.value) });
    settings.value = res.settings;
    saved.value = JSON.stringify(res.settings);
    d.notify(t("playerSettings.saved"));
  } catch (err) {
    d.notify(d.errMsg(err));
  }
  saving.value = false;
}
const reset = () => (settings.value = structuredClone(DEFAULT_PLAYER));

/** Los controles y el bucle se fijan al crear el reproductor: cambiarlos lo vuelve a montar. */
const previewKey = computed(() => {
  const s = settings.value;
  return s ? `${s.speed}${s.pip}${s.loop}${s.resume}${s.autoplay}${s.skipIntro.auto}${embedMode.value}` : "";
});
/** Intro predeterminada editable como «sin valor» cuando el fin es 0. */
const defStart = computed({
  get: () => (settings.value?.skipIntro.defaultEnd ? settings.value.skipIntro.defaultStart : null),
  set: (v: number | null) => settings.value && (settings.value.skipIntro.defaultStart = v ?? 0),
});
const defEnd = computed({
  get: () => (settings.value?.skipIntro.defaultEnd || null),
  set: (v: number | null) => settings.value && (settings.value.skipIntro.defaultEnd = v ?? 0),
});
/** Intro de la vista previa: la del video de ejemplo o la predeterminada. */
const previewIntro = computed(() => (settings.value ? resolveIntro(previewOwnIntro.value, settings.value) : null));
const previewOwnIntro = computed(() => d.videos.value.find((v) => v.id === preview.value?.publicId)?.intro ?? null);

const positionLabel = (p: string) => t.dynamic(`playerSettings.positions.${p}`);
const toggles = ["showTitle", "autoplay", "loop", "resume", "speed", "pip"] as const;
</script>

<template>
  <div v-if="settings" class="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
    <!-- Ajustes -->
    <div class="min-w-0 space-y-5">
      <DashCard :title="t('playerSettings.colorTitle')" :subtitle="t('playerSettings.colorSubtitle')">
        <div class="flex flex-wrap items-center gap-2.5">
          <button
            v-for="c in colors"
            :key="c"
            type="button"
            :aria-label="c"
            :aria-pressed="settings.color === c"
            class="press grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-[var(--surface-3)] transition"
            :class="settings.color === c ? 'ring-2 ring-[var(--text-contrast)]' : 'hover:scale-110'"
            :style="{ background: c, color: contrastOn(c) }"
            @click="settings.color = c"
          >
            <Check v-if="settings.color === c" class="h-4 w-4" />
          </button>
          <label class="hover-bright press relative grid h-9 w-9 cursor-pointer place-items-center overflow-hidden rounded-full bg-button" :title="t('playerSettings.custom')">
            <Palette class="h-4 w-4 text-primary" />
            <input v-model="settings.color" type="color" class="absolute inset-0 cursor-pointer opacity-0" :aria-label="t('playerSettings.custom')" />
          </label>
          <code class="kbd ml-1">{{ settings.color }}</code>
        </div>
      </DashCard>

      <DashCard :title="t('playerSettings.watermarkTitle')" :subtitle="t('playerSettings.watermarkSubtitle')">
        <UiSegmented
          v-model="settings.watermark.type"
          :label="t('playerSettings.watermarkTitle')"
          :options="[
            { value: 'none', label: t('playerSettings.wmNone') },
            { value: 'text', label: t('playerSettings.wmText') },
            { value: 'image', label: t('playerSettings.wmImage') },
          ]"
        />
        <template v-if="settings.watermark.type !== 'none'">
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <label v-if="settings.watermark.type === 'text'" class="block min-w-0 sm:col-span-2">
              <span class="label flex items-center gap-1.5"><Type class="h-4 w-4" />{{ t("playerSettings.wmTextLabel") }}</span>
              <input v-model="settings.watermark.text" maxlength="40" class="input" :placeholder="t('playerSettings.wmTextPlaceholder')" />
            </label>
            <label v-else class="block min-w-0 sm:col-span-2">
              <span class="label flex items-center gap-1.5"><ImageIcon class="h-4 w-4" />{{ t("playerSettings.wmImageLabel") }}</span>
              <input v-model.trim="settings.watermark.imageUrl" type="url" maxlength="500" class="input" placeholder="https://midominio.com/logo.png" />
              <span class="mt-1 block text-xs text-secondary">{{ t("playerSettings.wmImageHint") }}</span>
            </label>
            <label class="block min-w-0 sm:col-span-2">
              <span class="label">{{ t("playerSettings.wmLink") }}</span>
              <input v-model.trim="settings.watermark.link" type="url" maxlength="500" class="input" placeholder="https://midominio.com" />
            </label>
            <div class="min-w-0">
              <span class="label">{{ t("playerSettings.position") }}</span>
              <div class="grid grid-cols-2 gap-1.5">
                <button
                  v-for="p in WATERMARK_POSITIONS"
                  :key="p"
                  type="button"
                  :aria-pressed="settings.watermark.position === p"
                  :class="['rounded-lg px-2 py-1.5 text-xs font-bold transition', settings.watermark.position === p ? 'bg-brand-highlight text-brand' : 'bg-button text-secondary hover:text-contrast']"
                  @click="settings.watermark.position = p"
                >
                  {{ positionLabel(p) }}
                </button>
              </div>
            </div>
            <label class="block min-w-0">
              <span class="label">{{ t("playerSettings.opacity", { value: settings.watermark.opacity }) }}</span>
              <input v-model.number="settings.watermark.opacity" type="range" min="20" max="100" step="5" class="mt-2 w-full accent-[var(--brand)]" />
            </label>
          </div>
        </template>
      </DashCard>

      <DashCard :title="t('playerSettings.introTitle')" :subtitle="t('playerSettings.introSubtitle')">
        <ul class="divide-y divide-divider">
          <li class="flex items-center justify-between gap-4 pb-3">
            <div class="min-w-0">
              <p class="font-bold text-contrast">{{ t("playerSettings.introEnabled") }}</p>
              <p class="text-sm text-secondary">{{ t("playerSettings.introEnabledHint") }}</p>
            </div>
            <UiToggle v-model="settings.skipIntro.enabled" :label="t('playerSettings.introEnabled')" />
          </li>
          <li :class="['flex items-center justify-between gap-4 py-3', settings.skipIntro.enabled ? '' : 'pointer-events-none opacity-50']">
            <div class="min-w-0">
              <p class="font-bold text-contrast">{{ t("playerSettings.introAuto") }}</p>
              <p class="text-sm text-secondary">{{ t("playerSettings.introAutoHint") }}</p>
            </div>
            <UiToggle v-model="settings.skipIntro.auto" :label="t('playerSettings.introAuto')" />
          </li>
          <li :class="['pt-3', settings.skipIntro.enabled ? '' : 'pointer-events-none opacity-50']">
            <p class="font-bold text-contrast">{{ t("playerSettings.introDefault") }}</p>
            <p class="text-sm text-secondary">{{ t("playerSettings.introDefaultHint") }}</p>
            <div class="mt-2.5 grid max-w-sm grid-cols-2 gap-2">
              <label class="block min-w-0">
                <span class="mb-1 block text-xs font-semibold text-secondary">{{ t("video.intro.from") }}</span>
                <DashTimeInput v-model="defStart" :label="t('video.intro.from')" />
              </label>
              <label class="block min-w-0">
                <span class="mb-1 block text-xs font-semibold text-secondary">{{ t("video.intro.to") }}</span>
                <DashTimeInput v-model="defEnd" :label="t('video.intro.to')" placeholder="1:30" />
              </label>
            </div>
          </li>
        </ul>
      </DashCard>

      <DashCard :title="t('playerSettings.behaviorTitle')" :subtitle="t('playerSettings.behaviorSubtitle')">
        <ul class="divide-y divide-divider">
          <li v-for="k in toggles" :key="k" class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div class="min-w-0">
              <p class="font-bold text-contrast">{{ t.dynamic(`playerSettings.toggles.${k}.title`) }}</p>
              <p class="text-sm text-secondary">{{ t.dynamic(`playerSettings.toggles.${k}.hint`) }}</p>
            </div>
            <UiToggle v-model="settings[k]" :label="t.dynamic(`playerSettings.toggles.${k}.title`)" />
          </li>
        </ul>
      </DashCard>
    </div>

    <!-- Vista previa (en móvil, arriba: así se ve cada cambio) -->
    <div class="order-first min-w-0 xl:order-none">
      <div class="space-y-4 xl:sticky xl:top-4">
        <DashCard :title="t('playerSettings.previewTitle')" :subtitle="t('playerSettings.previewSubtitle')">
          <template #action>
            <UiSegmented
              v-model="mode"
              :label="t('playerSettings.previewTitle')"
              :options="[
                { value: 'embed', label: t('playerSettings.asEmbed') },
                { value: 'page', label: t('playerSettings.asPage') },
              ]"
            />
          </template>
          <div class="aspect-video w-full overflow-hidden rounded-xl bg-black">
            <PlayerVideoPlayer
              v-if="preview"
              :key="previewKey"
              :source="preview.source"
              :title="preview.title"
              :appearance="settings"
              :embed="embedMode"
              :intro="previewIntro"
              :subtitles="preview.subtitles"
            />
            <!-- Sin videos: maqueta estática con los mismos colores y marcas. -->
            <div v-else class="relative h-full w-full bg-[radial-gradient(80%_80%_at_30%_20%,#2a2d33,#0b0c0e)]">
              <div v-if="embedMode && settings.showTitle" class="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-3 text-sm font-bold text-white">{{ t("playerSettings.sampleTitle") }}</div>
              <div
                v-if="(settings.watermark.type === 'text' && settings.watermark.text) || (settings.watermark.type === 'image' && settings.watermark.imageUrl)"
                :class="['absolute max-w-[40%]', { tl: 'left-4 top-3', tr: 'right-4 top-3', bl: 'bottom-14 left-4', br: 'bottom-14 right-4' }[settings.watermark.position], embedMode && settings.showTitle && settings.watermark.position.startsWith('t') ? '!top-11' : '']"
                :style="{ opacity: settings.watermark.opacity / 100 }"
              >
                <img v-if="settings.watermark.type === 'image'" :src="settings.watermark.imageUrl" alt="" referrerpolicy="no-referrer" class="max-h-10 object-contain" />
                <span v-else class="block truncate text-sm font-extrabold text-white [text-shadow:0_1px_4px_rgba(0,0,0,.7)]">{{ settings.watermark.text }}</span>
              </div>
              <span class="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full" :style="{ background: settings.color, color: contrastOn(settings.color) }"><Play class="ml-0.5 h-6 w-6 fill-current" /></span>
              <div class="absolute inset-x-4 bottom-4 flex items-center gap-3">
                <Play class="h-4 w-4 fill-white text-white" />
                <div class="h-1 flex-1 rounded-full bg-white/30"><div class="h-full w-1/3 rounded-full" :style="{ background: settings.color }" /></div>
                <span class="text-xs text-white/80">1:24 / 4:10</span>
              </div>
              <span
                v-if="settings.skipIntro.enabled && settings.skipIntro.defaultEnd"
                class="absolute bottom-14 right-4 inline-flex items-center gap-1.5 rounded-[10px] border border-white/35 bg-black/60 px-3 py-2 text-xs font-bold text-white"
                >{{ t("player.skipIntro") }}<ChevronsRight class="h-3.5 w-3.5"
              /></span>
              <p class="absolute inset-x-0 bottom-12 text-center text-xs font-semibold text-white/60">{{ t("playerSettings.noVideo") }}</p>
            </div>
          </div>
          <p class="mt-3 flex items-start gap-2 text-xs text-secondary"><MonitorPlay class="mt-0.5 h-4 w-4 shrink-0" />{{ t("playerSettings.appliesTo") }}</p>
        </DashCard>

        <div class="flex flex-wrap items-center justify-end gap-2">
          <UiButton color="transparent" @click="reset"><RotateCcw />{{ t("playerSettings.reset") }}</UiButton>
          <UiButton color="brand" :disabled="!dirty || saving" @click="save">{{ saving ? t("common.saving") : dirty ? t("admin.saveChanges") : t("admin.saved") }}</UiButton>
        </div>
        <p class="flex items-start gap-2 rounded-xl bg-button px-4 py-3 text-xs text-secondary"><Code class="mt-0.5 h-4 w-4 shrink-0" />{{ t("playerSettings.embedHint") }}</p>
      </div>
    </div>
  </div>
  <div v-else class="h-64 animate-pulse rounded-2xl bg-raised" />
</template>
