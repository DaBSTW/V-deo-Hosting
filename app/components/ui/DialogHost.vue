<script setup lang="ts">
const { state, close } = useDialogs();
const { t } = useI18n();
const value = ref("");
const busy = ref(false);

watch(state, (s) => {
  if (s?.kind === "prompt") value.value = s.initial ?? "";
  busy.value = false;
});

async function submit() {
  const s = state.value;
  if (!s) return;
  busy.value = true;
  try {
    if (s.kind === "prompt") {
      if (!value.value.trim()) return (busy.value = false);
      if (await s.onSubmit(value.value.trim())) close();
      else busy.value = false;
    } else {
      await s.onConfirm();
      close();
    }
  } catch {
    busy.value = false;
  }
}
</script>

<template>
  <UiModal :open="!!state" :title="state?.title" size="sm" @close="close">
    <form v-if="state" class="space-y-5 px-5 pb-5 pt-1" @submit.prevent="submit">
      <label v-if="state.kind === 'prompt'" class="block">
        <span class="label">{{ state.label }}</span>
        <input v-model="value" autofocus :maxlength="state.maxLength ?? 200" class="input" @focus="($event.target as HTMLInputElement).select()" />
      </label>
      <p v-else class="text-sm leading-relaxed text-primary">{{ state.message }}</p>
      <div class="flex justify-end gap-2">
        <UiButton color="transparent" @click="close">{{ t("common.cancel") }}</UiButton>
        <UiButton type="submit" :color="state.kind === 'confirm' && state.danger ? 'red' : 'brand'" :disabled="busy">
          {{ busy ? t("common.oneMoment") : state.confirmLabel }}
        </UiButton>
      </div>
    </form>
  </UiModal>
</template>
