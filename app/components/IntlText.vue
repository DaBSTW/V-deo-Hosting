<script setup lang="ts">
/**
 * Texto traducido con etiquetas: `<IntlText k="faq.a6"><template #link="{ text }">…</template></IntlText>`.
 * Cada etiqueta del mensaje (`<link>…</link>`) se pinta con el slot del mismo nombre.
 */
import type { MessageKey, MessageValues } from "#shared/i18n/translator";

const props = defineProps<{ k: MessageKey; values?: MessageValues }>();
const slots = useSlots();
const { t } = useI18n();

type Part = string | { tag: string; text: string };
const parts = computed<Part[]>(() => {
  const tags = Object.fromEntries(
    Object.keys(slots).map((tag) => [tag, (chunks: unknown[]) => ({ tag, text: chunks.map(String).join("") })]),
  );
  return t.rich<{ tag: string; text: string }>(props.k, { ...(props.values ?? {}), ...tags } as never);
});
</script>

<template>
  <template v-for="(part, i) in parts" :key="i">
    <template v-if="typeof part === 'string'">{{ part }}</template>
    <slot v-else :name="part.tag" :text="part.text" />
  </template>
</template>
