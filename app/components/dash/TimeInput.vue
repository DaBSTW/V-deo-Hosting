<script setup lang="ts">
/** Campo de tiempo «m:ss» (o «h:mm:ss»). El modelo son segundos o `null` si está vacío. */
const model = defineModel<number | null>({ required: true });
defineProps<{ label: string; placeholder?: string }>();

const fmt = (s: number | null) => {
  if (s == null) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
/** Acepta «90», «1:30» o «1:02:03». Devuelve `undefined` si no se entiende. */
const parse = (v: string): number | null | undefined => {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return undefined;
  return t.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
};

const text = ref(fmt(model.value));
const invalid = ref(false);
watch(model, (v) => {
  if (parse(text.value) !== v) text.value = fmt(v);
});
function commit() {
  const v = parse(text.value);
  invalid.value = v === undefined;
  if (v === undefined) return;
  model.value = v;
  text.value = fmt(v);
}
</script>

<template>
  <input
    v-model="text"
    inputmode="numeric"
    :aria-label="label"
    :aria-invalid="invalid"
    :placeholder="placeholder ?? '0:00'"
    :class="['input tabular-nums', invalid ? '!border-red' : '']"
    @blur="commit"
    @keydown.enter.prevent="commit"
  />
</template>
