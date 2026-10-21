<script setup lang="ts">
/** Código de inserción con selector de tamaño. */
const props = defineProps<{ embedUrl: string; title: string }>();
const { t } = useI18n();

type Size = "responsive" | "640x360" | "854x480" | "1280x720";
const SIZES: Size[] = ["responsive", "640x360", "854x480", "1280x720"];
const size = ref<Size>("responsive");

const ALLOW = "autoplay; fullscreen; picture-in-picture; encrypted-media";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const code = computed(() => {
  const title = esc(props.title);
  if (size.value === "responsive") {
    return (
      `<div style="position:relative;width:100%;padding-top:56.25%">` +
      `<iframe src="${props.embedUrl}" title="${title}" style="position:absolute;inset:0;width:100%;height:100%;border:0" ` +
      `allow="${ALLOW}" allowfullscreen loading="lazy"></iframe></div>`
    );
  }
  const [w, h] = size.value.split("x");
  return `<iframe src="${props.embedUrl}" title="${title}" width="${w}" height="${h}" style="border:0" allow="${ALLOW}" allowfullscreen loading="lazy"></iframe>`;
});
const options = computed(() => SIZES.map((s) => ({ value: s, label: s === "responsive" ? t("watch.responsive") : s.replace("x", " × ") })));
</script>

<template>
  <div class="card">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-extrabold text-contrast">{{ t("watch.embedTitle") }}</h2>
      <div class="max-w-full overflow-x-auto"><UiSegmented v-model="size" :options="options" :label="t('watch.embed')" /></div>
    </div>
    <UiCopyField :value="code" :label="t('watch.embed')" multiline />
    <p class="mt-3 text-sm text-secondary">{{ t("watch.embedHint") }}</p>
  </div>
</template>
