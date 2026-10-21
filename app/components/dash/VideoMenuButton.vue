<script setup lang="ts">
import { EllipsisVertical } from "lucide-vue-next";
import type { PublicVideo } from "~/composables/useDashboard";
defineProps<{ video: PublicVideo; up?: boolean }>();
const { t } = useI18n();
const menuFor = useVideoMenu();
</script>

<template>
  <UiMenu :items="menuFor(video)" :label="t('video.menuLabel')" :up="up">
    <template #trigger="{ toggle, open }">
      <UiButton color="transparent" size="sm" icon-only :aria-label="t('video.moreActions')" :aria-expanded="open" :class="open ? '!bg-button !text-contrast' : ''" @click="toggle">
        <EllipsisVertical />
      </UiButton>
    </template>
  </UiMenu>
</template>
