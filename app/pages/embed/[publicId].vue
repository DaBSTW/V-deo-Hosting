<script setup lang="ts">
/** /embed/:publicId — reproductor a pantalla completa pensado para iframes. */
definePageMeta({ layout: "bare" });
const route = useRoute();
const { t } = useI18n();
const data = await usePublicVideo(String(route.params.publicId));
useHead(() => ({
  title: data.value.title,
  meta: [{ name: "robots", content: "noindex, nofollow" }],
  bodyAttrs: { class: "embed" },
  htmlAttrs: { style: "background:#000" },
}));
</script>

<template>
  <div class="fixed inset-0 overflow-hidden bg-black">
    <PlayerVideoPlayer
      v-if="data.state === 'ready'"
      :source="data.source"
      :title="data.title"
      :auto-play="route.query.autoplay === '1'"
      :view-url="data.viewUrl"
      :qualify-after-sec="data.monetization?.qualifyAfterSec"
      :appearance="data.player"
      :intro="data.intro"
      :subtitles="data.subtitles"
      :resume-key="data.publicId"
      embed
    />
    <PlayerMessage v-else :title="data.title" :kind="data.state" :message="data.state === 'processing' ? t('player.processing') : t('player.unavailable')" />
  </div>
</template>
