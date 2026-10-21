<script setup lang="ts">
const { t } = useI18n();
useHead(() => ({ title: t("auth.registerTitle") }));
</script>

<template>
  <AuthCard :title="t('auth.registerTitle')"><AuthForm mode="register" /></AuthCard>
</template>
