<script setup lang="ts">
import type { PublicVideoStatus } from "~/composables/useDashboard";
defineProps<{ status: PublicVideoStatus }>();
const { t } = useI18n();
const COLORS = { uploading: "gray", processing: "orange", ready: "brand", error: "red" } as const;
</script>

<template>
  <UiBadge :color="COLORS[status]" :class="status === 'processing' || status === 'uploading' ? '[&>span:first-child]:animate-pulse' : ''">{{ t(`status.${status}`) }}</UiBadge>
</template>
