<script setup lang="ts">
const { t } = useI18n();
useHead(() => ({ title: t("auth.loginTitle") }));
</script>

<template>
  <AuthCard :title="t('auth.loginTitle')"><AuthForm mode="login" /></AuthCard>
</template>
