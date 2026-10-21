<script setup lang="ts">
/** /legal/:slug — páginas legales en el idioma del visitante. */
import { FileText } from "lucide-vue-next";
import type { LegalDoc } from "#shared/content/legal/types";

const route = useRoute();
const { t, locale } = useI18n();
const slug = computed(() => String(route.params.slug));
const { data, error } = await useFetch<{ slug: string; slugs: string[]; doc: LegalDoc; updated: string }>(() => `/api/public/legal/${slug.value}`, {
  // El texto depende del idioma: se vuelve a pedir al cambiarlo.
  query: { locale },
});
if (error.value || !data.value) throw createError({ statusCode: 404, statusMessage: "Not found", fatal: true });

useHead(() => ({ title: data.value?.doc.title, meta: [{ name: "description", content: data.value?.doc.summary ?? "" }] }));
const updated = computed(() =>
  data.value ? new Intl.DateTimeFormat(locale.value, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${data.value.updated}T00:00:00Z`)) : "",
);
</script>

<template>
  <div v-if="data" class="mx-auto grid max-w-[1280px] grid-cols-1 gap-5 px-4 pb-16 pt-2 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
    <nav :aria-label="t('footer.legal')" class="card h-fit !p-3 lg:sticky lg:top-6">
      <p class="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wide text-secondary">{{ t("footer.legal") }}</p>
      <ul class="flex flex-wrap gap-1 lg:flex-col">
        <li v-for="s in data.slugs" :key="s">
          <NuxtLink
            :to="`/legal/${s}`"
            :aria-current="s === slug ? 'page' : undefined"
            :class="[
              'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition',
              s === slug ? 'bg-brand-highlight text-brand' : 'text-primary hover:bg-button hover:text-contrast',
            ]"
          >
            <FileText class="hidden h-[18px] w-[18px] lg:block" />{{ t.dynamic(`footer.links.${s}`) }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <article class="card !p-6 sm:!p-10">
      <h1 class="text-3xl font-extrabold tracking-tight text-contrast sm:text-4xl">{{ data.doc.title }}</h1>
      <p class="mt-2 text-sm font-semibold text-secondary">{{ t("legal.lastUpdated", { date: updated }) }}</p>
      <p class="mt-6 text-lg leading-relaxed text-primary">{{ data.doc.summary }}</p>
      <div class="mt-10 space-y-9">
        <section v-for="section in data.doc.sections" :key="section.title">
          <h2 class="text-xl font-extrabold text-contrast">{{ section.title }}</h2>
          <div class="mt-3 space-y-3 text-[15px] leading-relaxed text-primary">
            <template v-for="(b, i) in section.blocks" :key="i">
              <p v-if="typeof b === 'string'">{{ b }}</p>
              <ul v-else class="list-disc space-y-1.5 pl-5 marker:text-brand">
                <li v-for="item in b.list" :key="item">{{ item }}</li>
              </ul>
            </template>
          </div>
        </section>
      </div>
    </article>
  </div>
</template>
