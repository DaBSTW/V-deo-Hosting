<script setup lang="ts">
const props = defineProps<{ status: string }>();
const { t } = useI18n();
const COLORS: Record<string, "orange" | "blue" | "brand" | "red"> = { PENDING: "orange", APPROVED: "blue", PAID: "brand", REJECTED: "red" };
const known = computed(() => props.status in COLORS);
</script>

<template>
  <UiBadge :color="COLORS[status] ?? 'gray'">{{ known ? t.dynamic(`payoutStatus.${status}`) : status }}</UiBadge>
</template>
