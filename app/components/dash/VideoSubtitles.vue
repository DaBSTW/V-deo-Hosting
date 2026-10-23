<script setup lang="ts">
/** Subtítulos de un video (modal del panel): subir .srt/.vtt por idioma, predeterminados y borrar. */
import { Captions, Plus, Star, Trash2, Upload, X } from "lucide-vue-next";
import type { PublicSubtitle } from "#srv/videos/subtitles";

const props = defineProps<{ videoId: string }>();
const d = useDashboard();
const dialogs = useDialogs();
const { t, locale } = useI18n();

const LANGS = ["es", "en", "pt", "fr", "de", "it", "ca", "gl", "eu", "nl", "pl", "ru", "tr", "ar", "hi", "ja", "ko", "zh"];
const names = computed(() => new Intl.DisplayNames([locale.value], { type: "language" }));
const langName = (code: string) => {
  const n = names.value.of(code) ?? code;
  return n.charAt(0).toUpperCase() + n.slice(1);
};

const subs = ref<PublicSubtitle[] | null>(null);
const pending = ref<{ fileName: string; content: string; lang: string; label: string; isDefault: boolean } | null>(null);
const busy = ref(false);
const input = ref<HTMLInputElement>();

async function load() {
  subs.value = null;
  try {
    subs.value = (await api<{ subtitles: PublicSubtitle[] }>(`/api/videos/${props.videoId}/subtitles`)).subtitles;
  } catch (err) {
    d.notify(d.errMsg(err));
    subs.value = [];
  }
}
watch(() => props.videoId, load, { immediate: true });

/** Adivina el idioma por el nombre del archivo: «video.en.srt», «video_es.vtt»… */
function guessLang(name: string) {
  const m = /[._-]([a-z]{2,3}(?:-[A-Za-z]{2})?)\.(srt|vtt)$/i.exec(name);
  const code = m?.[1]?.toLowerCase();
  if (code && LANGS.includes(code.split("-")[0])) return code;
  const used = new Set(subs.value?.map((s) => s.lang));
  return [locale.value, "en", "es"].find((l) => !used.has(l)) ?? LANGS.find((l) => !used.has(l)) ?? "es";
}

async function pick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = "";
  if (!file) return;
  if (file.size > 1024 * 1024) return d.notify(t("errors.subtitlesTooLarge"));
  const lang = guessLang(file.name);
  pending.value = { fileName: file.name, content: await file.text(), lang, label: langName(lang), isDefault: !subs.value?.length };
}
watch(
  () => pending.value?.lang,
  (lang, old) => {
    // Si la etiqueta era el nombre automático del idioma anterior, la actualizamos.
    if (pending.value && lang && (!old || pending.value.label === langName(old))) pending.value.label = langName(lang);
  },
);

async function upload() {
  if (!pending.value) return;
  busy.value = true;
  try {
    const { fileName: _f, ...body } = pending.value;
    await api(`/api/videos/${props.videoId}/subtitles`, { method: "POST", body: JSON.stringify(body) });
    pending.value = null;
    d.notify(t("video.subtitles.added"));
    await load();
  } catch (err) {
    d.notify(d.errMsg(err));
  }
  busy.value = false;
}

async function makeDefault(s: PublicSubtitle) {
  try {
    await api(`/api/videos/${props.videoId}/subtitles/${s.id}`, { method: "PATCH", body: JSON.stringify({ isDefault: !s.isDefault }) });
    await load();
  } catch (err) {
    d.notify(d.errMsg(err));
  }
}

const remove = (s: PublicSubtitle) =>
  dialogs.confirm({
    title: t("video.subtitles.deleteTitle"),
    message: t("video.subtitles.deleteMsg", { label: s.label }),
    confirmLabel: t("common.delete"),
    danger: true,
    onConfirm: async () => {
      try {
        await api(`/api/videos/${props.videoId}/subtitles/${s.id}`, { method: "DELETE" });
        await load();
      } catch (err) {
        d.notify(d.errMsg(err));
      }
    },
  });
</script>

<template>
  <div class="rounded-2xl bg-button px-4 py-3">
    <div class="flex items-center justify-between gap-2">
      <span class="flex items-center gap-1.5 text-sm font-bold text-contrast"><Captions class="h-4 w-4" />{{ t("video.subtitles.title") }}</span>
      <UiButton v-if="!pending" size="sm" color="transparent" class="!h-7 !px-2" @click="input?.click()"><Plus />{{ t("video.subtitles.add") }}</UiButton>
      <input ref="input" type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden @change="pick" />
    </div>

    <ul v-if="subs?.length" class="mt-2 space-y-1.5">
      <li v-for="s in subs" :key="s.id" class="flex items-center gap-2 rounded-xl bg-raised px-3 py-2">
        <span class="rounded-md bg-button px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase text-secondary">{{ s.lang }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold text-contrast">{{ s.label }}</span>
          <span class="block text-xs text-secondary">{{ t("video.subtitles.cues", { count: s.cues }) }}<template v-if="s.isDefault"> · {{ t("video.subtitles.default") }}</template></span>
        </span>
        <UiButton size="sm" color="transparent" icon-only class="!h-8 !w-8" :title="t('video.subtitles.makeDefault')" :aria-label="t('video.subtitles.makeDefault')" :aria-pressed="s.isDefault" @click="makeDefault(s)">
          <Star :class="s.isDefault ? 'fill-[var(--brand)] text-brand' : ''" />
        </UiButton>
        <UiButton size="sm" color="transparent" icon-only class="!h-8 !w-8 hover:!text-red" :aria-label="t('common.delete')" @click="remove(s)"><Trash2 /></UiButton>
      </li>
    </ul>
    <p v-else-if="subs && !pending" class="mt-1.5 text-xs text-secondary">{{ t("video.subtitles.empty") }}</p>

    <!-- Archivo elegido: idioma y etiqueta antes de subirlo -->
    <div v-if="pending" class="mt-2.5 space-y-2 rounded-xl bg-raised p-3">
      <p class="flex items-center justify-between gap-2 text-xs font-semibold text-secondary">
        <span class="truncate">{{ pending.fileName }}</span>
        <button type="button" class="shrink-0 hover:text-contrast" :aria-label="t('common.cancel')" @click="pending = null"><X class="h-4 w-4" /></button>
      </p>
      <div class="grid grid-cols-2 gap-2">
        <label class="block min-w-0">
          <span class="mb-1 block text-xs font-semibold text-secondary">{{ t("video.subtitles.language") }}</span>
          <select v-model="pending.lang" class="input cursor-pointer">
            <option v-for="l in LANGS" :key="l" :value="l">{{ langName(l) }}</option>
          </select>
        </label>
        <label class="block min-w-0">
          <span class="mb-1 block text-xs font-semibold text-secondary">{{ t("video.subtitles.label") }}</span>
          <input v-model="pending.label" maxlength="60" class="input" />
        </label>
      </div>
      <label class="flex items-center gap-2 text-xs font-semibold text-primary">
        <input v-model="pending.isDefault" type="checkbox" class="accent-[var(--brand)]" />{{ t("video.subtitles.defaultHint") }}
      </label>
      <p v-if="subs?.some((s) => s.lang === pending!.lang)" class="text-xs font-semibold text-orange">{{ t("video.subtitles.replaces") }}</p>
      <UiButton size="sm" color="brand" :disabled="busy || !pending.label.trim()" @click="upload"><Upload />{{ t("video.subtitles.upload") }}</UiButton>
    </div>
    <p class="mt-2 text-xs text-secondary">{{ t("video.subtitles.hint") }}</p>
  </div>
</template>
