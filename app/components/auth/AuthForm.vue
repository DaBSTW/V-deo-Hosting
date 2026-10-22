<script setup lang="ts">
import { KeyRound, LogIn, Mail, User, UserPlus } from "lucide-vue-next";

const props = defineProps<{ mode: "login" | "register" }>();
const { t } = useI18n();
const route = useRoute();
const { refresh } = useSession();
const isLogin = computed(() => props.mode === "login");

const form = reactive({ name: "", email: "", password: "", acceptTerms: false });
const error = ref<string | null>(null);
const loading = ref(false);

async function submit() {
  error.value = null;
  loading.value = true;
  try {
    const res = await fetch(`/api/auth/${props.mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isLogin.value ? { email: form.email, password: form.password } : form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.details?.[0] ?? data.error ?? t("auth.genericError"));
    await refresh();
    const next = typeof route.query.next === "string" ? route.query.next : "";
    await navigateTo(/^\/(dashboard|premium)(?:[/?#]|$)/.test(next) ? next : "/dashboard", { replace: true });
  } catch (err) {
    error.value = (err as Error).message;
    loading.value = false;
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <label v-if="!isLogin" class="block">
      <span class="label">{{ t("auth.name") }} <span class="font-normal text-secondary">({{ t("auth.optional") }})</span></span>
      <span class="relative block">
        <User class="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-secondary" />
        <input v-model="form.name" name="name" autocomplete="name" class="input !pl-10" />
      </span>
    </label>
    <label class="block">
      <span class="label">{{ t("auth.email") }}</span>
      <span class="relative block">
        <Mail class="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-secondary" />
        <input v-model="form.email" name="email" type="email" required autocomplete="email" class="input !pl-10" />
      </span>
    </label>
    <label class="block">
      <span class="label">{{ t("auth.password") }}</span>
      <span class="relative block">
        <KeyRound class="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-secondary" />
        <input
          v-model="form.password"
          name="password"
          type="password"
          required
          minlength="8"
          :autocomplete="isLogin ? 'current-password' : 'new-password'"
          class="input !pl-10"
        />
      </span>
    </label>

    <label v-if="!isLogin" class="flex items-start gap-3 text-sm text-primary">
      <input v-model="form.acceptTerms" type="checkbox" name="acceptTerms" required class="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" />
      <span>
        <IntlText k="auth.acceptTerms">
          <template #terms="{ text }"><NuxtLink to="/legal/terms" target="_blank" class="font-semibold text-brand hover:underline">{{ text }}</NuxtLink></template>
          <template #privacy="{ text }"><NuxtLink to="/legal/privacy" target="_blank" class="font-semibold text-brand hover:underline">{{ text }}</NuxtLink></template>
        </IntlText>
      </span>
    </label>

    <p v-if="error" role="alert" class="rounded-xl bg-red-soft px-3.5 py-2.5 text-sm font-semibold text-red">{{ error }}</p>

    <UiButton type="submit" color="brand" block :disabled="loading">
      <component :is="isLogin ? LogIn : UserPlus" />
      {{ loading ? t("auth.oneMoment") : isLogin ? t("auth.submitLogin") : t("auth.submitRegister") }}
    </UiButton>

    <p class="text-center text-sm text-secondary">
      {{ isLogin ? t("auth.noAccount") : t("auth.haveAccount") }}
      <NuxtLink :to="{ path: isLogin ? '/register' : '/login', query: route.query.next ? { next: route.query.next } : {} }" class="font-bold text-brand hover:underline">{{ isLogin ? t("auth.goRegister") : t("auth.goLogin") }}</NuxtLink>
    </p>
  </form>
</template>
