<script setup lang="ts">
import { PLAYER_COLORS, contrastOn } from "#shared/lib/player-settings";
import {
  ArrowRight,
  Calculator,
  ChartNoAxesColumn,
  Check,
  Clapperboard,
  Code,
  Crown,
  Download,
  FolderOpen,
  Gamepad2,
  Gauge,
  Globe,
  GraduationCap,
  History,
  Languages,
  Lock,
  MonitorPlay,
  Music,
  Newspaper,
  Palette,
  Play,
  Plus,
  Radio,
  Repeat,
  ShieldCheck,
  Stamp,
  Timer,
  Upload,
  X,
  Zap,
} from "lucide-vue-next";

interface HomeData {
  appUrl: string;
  maxUploadBytes: number;
  minPayoutUsd: number;
  minWatchSeconds: number;
  revenueSharePct: number | null;
  verificationMeta: { name: string; content: string } | null;
  calculator: { month: string | null; countries: { code: string; creatorRpm: number }[] };
  premium: { monthlyUsd: number; yearlyUsd: number; waitSec: number; sharePct: number; speedLimit: boolean } | null;
}

const { t, locale } = useI18n();
const fmt = useFormat();
const appName = useAppName();
const { user } = useSession();
const { data } = await useFetch<HomeData>("/api/public/home");

useHead(() => ({
  title: t("landing.metaTitle"),
  meta: data.value?.verificationMeta ? [{ name: data.value.verificationMeta.name, content: data.value.verificationMeta.content }] : [],
}));

const minPayout = computed(() => fmt.formatUsd(data.value?.minPayoutUsd ?? 25));
const embedSrc = computed(() => `${(data.value?.appUrl ?? "").replace(/\/$/, "")}/embed/v_8fK2pQx7`);

const highlights = [
  { icon: ShieldCheck, key: "landing.highlights.noWatermark" },
  { icon: Zap, key: "landing.highlights.adaptive" },
  { icon: Lock, key: "landing.highlights.signed" },
  { icon: Languages, key: "landing.highlights.bilingual" },
] as const;

const features = [
  { key: "player", icon: MonitorPlay },
  { key: "embed", icon: Code },
  { key: "upload", icon: Upload },
  { key: "downloads", icon: Download },
  { key: "stats", icon: ChartNoAxesColumn },
  { key: "library", icon: FolderOpen },
] as const;

/** Porcentaje del RPM real para los creadores (30 % por defecto si la monetización está desactivada). */
const share = computed(() => data.value?.revenueSharePct ?? 30);
const example = computed(() => ({ rpm: fmt.formatUsd(1.5), creator: fmt.formatUsd((1.5 * share.value) / 100) }));
const openFaq = ref<number | null>(8);
/** Primero las preguntas de quien llega desde YouTube o WordPress. */
const faqOrder = [8, 9, 10, 11, 1, 2, 3, 4, 5, 6, 7];

const audiences = [
  { key: "blogs", icon: Newspaper },
  { key: "creators", icon: Clapperboard },
  { key: "academies", icon: GraduationCap },
  { key: "media", icon: Radio },
  { key: "music", icon: Music },
  { key: "gaming", icon: Gamepad2 },
] as const;

/** Comparativa con YouTube y Vimeo (true/false = ✓/✗; texto = clave de `landing.compare`). */
type Cell = boolean | "free" | "paid" | "paidPlans";
const compareRows: { key: "earn" | "noRecs" | "brand" | "downloads" | "price"; cells: [Cell, Cell, Cell] }[] = [
  { key: "earn", cells: [true, false, false] },
  { key: "noRecs", cells: [true, false, true] },
  { key: "brand", cells: [true, false, "paid"] },
  { key: "downloads", cells: [true, false, "paid"] },
  { key: "price", cells: ["free", "free", "paidPlans"] },
];

/** Calculadora: RPM para el creador del último cierre (o de ejemplo, ya con su %). */
const calcViews = ref(50_000);
const calcCountry = ref("MX");
const regionNames = computed(() => new Intl.DisplayNames([locale.value], { type: "region" }));
const countryName = (code: string) => regionNames.value.of(code) ?? code;
const calcRpm = computed(() => data.value?.calculator.countries.find((c) => c.code === calcCountry.value)?.creatorRpm ?? 0);
const calcResult = computed(() => fmt.formatUsd((calcViews.value / 1000) * calcRpm.value));
const calcNote = computed(() => {
  const month = data.value?.calculator.month;
  const country = countryName(calcCountry.value);
  if (!month) return t("landing.calc.noteExample", { country, share: share.value });
  const label = new Intl.DateTimeFormat(locale.value, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  return t("landing.calc.noteReal", { country, month: label, share: share.value });
});

/** «Velocidad sin límite» solo se anuncia si los gratuitos la tienen limitada. */
/** Sección «Reproductor personalizable»: muestras de color para probar en vivo. */
const demoColor = ref<string>(PLAYER_COLORS[0]);
const playerPoints = [
  { key: "color", icon: Palette },
  { key: "brand", icon: Stamp },
  { key: "behavior", icon: Repeat },
  { key: "resume", icon: History },
] as const;

const premiumBenefits = computed(() =>
  [
    { key: "noAds", icon: MonitorPlay },
    { key: "noWait", icon: Timer },
    { key: "speed", icon: Gauge },
  ].filter((b) => b.key !== "speed" || data.value?.premium?.speedLimit),
);
/** Precio mensual más bajo (el anual prorrateado si sale más barato). */
const premiumFrom = computed(() => {
  const p = data.value?.premium;
  if (!p) return "";
  return fmt.formatUsd(Math.floor(Math.min(p.monthlyUsd, p.yearlyUsd / 12) * 100) / 100);
});

function faqAnswer(n: number): string {
  if (n === 2) return t("landing.faq.a2", { max: fmt.formatBytes(data.value?.maxUploadBytes ?? 0) });
  if (n === 3) return t("landing.faq.a3", { seconds: data.value?.minWatchSeconds ?? 60 });
  if (n === 4) return t("landing.faq.a4", { min: minPayout.value });
  if (n === 10) return t("landing.faq.a10", { min: minPayout.value });
  return t.dynamic(`landing.faq.a${n}`);
}
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="relative -mt-[72px] overflow-hidden">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,var(--hero-glow),transparent)]" />
      <div class="relative mx-auto max-w-[1280px] px-4 pb-24 pt-28 text-center sm:px-6 sm:pt-36">
        <span class="inline-flex items-center gap-2 rounded-full border border-divider bg-raised px-3.5 py-1.5 text-xs font-bold text-primary">
          <span class="h-2 w-2 rounded-full bg-brand" />
          {{ t("landing.hero.badge") }}
        </span>
        <h1 class="mx-auto mt-7 max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight text-contrast sm:text-6xl">
          <IntlText k="landing.hero.title">
            <template #accent="{ text }"><span class="text-brand">{{ text }}</span></template>
          </IntlText>
        </h1>
        <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{{ t("landing.hero.subtitle", { share }) }}</p>
        <div class="mt-9 flex flex-wrap justify-center gap-3">
          <UiButton :to="user ? '/dashboard' : '/register'" color="brand" size="lg">
            {{ user ? t("landing.cta.dashboard") : t("landing.hero.primary") }}
            <ArrowRight />
          </UiButton>
          <UiButton to="/#how" size="lg">{{ t("landing.hero.secondary") }}</UiButton>
        </div>
        <p class="mt-5 text-sm text-secondary">{{ t("landing.hero.note", { max: fmt.formatBytes(data?.maxUploadBytes ?? 0), min: minPayout }) }}</p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-2">
          <span class="mr-1 text-sm font-bold text-secondary">{{ t("landing.hero.idealFor") }}</span>
          <span v-for="a in audiences" :key="a.key" class="inline-flex items-center gap-1.5 rounded-full border border-divider bg-raised px-3.5 py-1.5 text-sm font-bold text-contrast">
            <component :is="a.icon" class="h-4 w-4 text-brand" />{{ t.dynamic(`landing.hero.audiences.${a.key}`) }}
          </span>
        </div>
        <div class="mt-16"><HomeShowcase /></div>
      </div>
    </section>

    <!-- Puntos fuertes -->
    <section class="mx-auto max-w-[1280px] px-4 sm:px-6">
      <ul class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <li v-for="h in highlights" :key="h.key" class="flex items-center gap-3 rounded-2xl bg-raised px-4 py-3.5 text-sm font-bold text-contrast">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-highlight text-brand"><component :is="h.icon" class="h-[18px] w-[18px]" /></span>
          {{ t(h.key) }}
        </li>
      </ul>
    </section>

    <!-- Funciones -->
    <section id="features" class="mx-auto max-w-[1280px] scroll-mt-20 px-4 py-24 sm:px-6">
      <HomeSectionHeading center :eyebrow="t('landing.features.eyebrow')" :title="t('landing.features.title')" :subtitle="t('landing.features.subtitle')" />
      <div class="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="f in features" :key="f.key" class="group rounded-2xl bg-raised p-6 shadow-card transition hover:-translate-y-0.5">
          <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-highlight text-brand transition group-hover:scale-105"><component :is="f.icon" class="h-6 w-6" /></span>
          <h3 class="mt-5 text-lg font-extrabold text-contrast">{{ t.dynamic(`landing.features.${f.key}.title`) }}</h3>
          <p class="mt-2 text-[15px] leading-relaxed text-secondary">{{ t.dynamic(`landing.features.${f.key}.text`) }}</p>
        </article>
      </div>
    </section>

    <!-- Comparativa -->
    <section class="mx-auto max-w-[1100px] px-4 pb-24 sm:px-6">
      <HomeSectionHeading center :eyebrow="t('landing.compare.eyebrow')" :title="t('landing.compare.title')" :subtitle="t('landing.compare.subtitle')" />
      <div class="mt-10 overflow-hidden rounded-2xl bg-raised shadow-card">
        <table class="w-full table-fixed text-[13px] sm:text-sm">
          <colgroup><col class="w-[40%]" /><col /><col /><col /></colgroup>
          <thead>
            <tr class="border-b border-divider text-left">
              <th class="px-2 py-4 sm:px-5"><span class="sr-only">{{ t("landing.compare.eyebrow") }}</span></th>
              <th class="bg-brand-soft px-2 py-4 sm:px-5 text-center"><span class="inline-flex rounded-full bg-brand-highlight px-1.5 py-1 text-xs font-extrabold text-brand sm:px-3 sm:text-sm">{{ appName }}</span></th>
              <th class="px-2 py-4 sm:px-5 text-center font-bold text-secondary">YouTube</th>
              <th class="px-2 py-4 sm:px-5 text-center font-bold text-secondary">Vimeo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in compareRows" :key="r.key" class="border-b border-divider last:border-0">
              <th scope="row" class="py-3.5 pl-4 pr-2 text-left sm:px-5 font-semibold text-contrast">{{ t.dynamic(`landing.compare.${r.key}`) }}</th>
              <td v-for="(v, i) in r.cells" :key="i" :class="['px-2 py-3.5 sm:px-5 text-center', i === 0 ? 'bg-brand-soft' : '']">
                <span v-if="typeof v === 'string'" :class="['font-bold', i === 0 ? 'text-brand' : 'text-secondary']">{{ t.dynamic(`landing.compare.${v}`) }}</span>
                <Check v-else-if="v" :class="['mx-auto h-5 w-5', i === 0 ? 'text-brand' : 'text-primary']" :aria-label="t('landing.compare.yes')" />
                <X v-else class="mx-auto h-5 w-5 text-red" :aria-label="t('landing.compare.no')" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mx-auto mt-3 max-w-3xl text-center text-xs leading-relaxed text-secondary">{{ t("landing.compare.note") }}</p>
    </section>

    <!-- Cómo funciona -->
    <section id="how" class="scroll-mt-20 bg-bg-soft py-24">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6">
        <HomeSectionHeading center :eyebrow="t('landing.how.eyebrow')" :title="t('landing.how.title')" />
        <ol class="relative mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          <li v-for="(step, i) in ['step1', 'step2', 'step3']" :key="step" class="relative rounded-2xl bg-raised p-6 shadow-card">
            <span class="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-lg font-extrabold text-on-brand">{{ i + 1 }}</span>
            <h3 class="mt-5 text-xl font-extrabold text-contrast">{{ t.dynamic(`landing.how.${step}.title`) }}</h3>
            <p class="mt-2 text-[15px] leading-relaxed text-secondary">{{ t.dynamic(`landing.how.${step}.text`) }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- Inserción -->
    <section class="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
      <div class="min-w-0">
        <HomeSectionHeading :eyebrow="t('landing.embed.eyebrow')" :title="t('landing.embed.title')" :subtitle="t('landing.embed.text')" />
        <ul class="mt-7 space-y-3">
          <li v-for="p in ['point1', 'point2', 'point3']" :key="p" class="flex items-center gap-3 font-semibold text-contrast">
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-highlight text-brand"><Check class="h-3.5 w-3.5" /></span>
            {{ t.dynamic(`landing.embed.${p}`) }}
          </li>
        </ul>
      </div>
      <div class="min-w-0 overflow-hidden rounded-2xl border border-divider bg-surface shadow-floating">
        <div class="flex items-center justify-between border-b border-divider px-4 py-3">
          <span class="flex items-center gap-2 text-xs font-bold text-secondary"><Globe class="h-4 w-4" />embed.html</span>
          <span class="flex gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-raised-3" /><span class="h-2.5 w-2.5 rounded-full bg-raised-3" /><span class="h-2.5 w-2.5 rounded-full bg-raised-3" /></span>
        </div>
        <pre class="whitespace-pre-wrap break-all p-5 font-mono text-[13px] leading-relaxed text-primary"><code><span class="text-secondary">&lt;div style="position:relative;padding-top:56.25%"&gt;</span>
  <span class="text-brand">&lt;iframe</span>
    <span class="text-blue">src</span>=<span class="text-orange">"{{ embedSrc }}"</span>
    <span class="text-blue">loading</span>=<span class="text-orange">"lazy"</span>
    <span class="text-blue">allow</span>=<span class="text-orange">"autoplay; fullscreen; picture-in-picture"</span>
    <span class="text-blue">allowfullscreen</span>
    <span class="text-blue">style</span>=<span class="text-orange">"position:absolute;inset:0;width:100%;height:100%;border:0"</span><span class="text-brand">&gt;&lt;/iframe&gt;</span>
<span class="text-secondary">&lt;/div&gt;</span></code></pre>
      </div>
    </section>

    <!-- Reproductor personalizable -->
    <section id="player" class="scroll-mt-20 bg-bg-soft py-24">
      <div class="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <!-- Maqueta interactiva: el color cambia al pulsar las muestras -->
        <div class="order-2 min-w-0 lg:order-1">
          <div class="relative aspect-video overflow-hidden rounded-2xl bg-[radial-gradient(80%_80%_at_30%_20%,#2a2d33,#0b0c0e)] shadow-floating">
            <div class="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-5 pb-8 pt-4 text-sm font-bold text-white">{{ t("landing.player.sampleTitle") }}</div>
            <span class="absolute right-5 top-12 text-sm font-extrabold text-white/80 [text-shadow:0_1px_4px_rgba(0,0,0,.7)]">{{ t("landing.player.sampleBrand") }}</span>
            <span class="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full transition-colors" :style="{ background: demoColor, color: contrastOn(demoColor) }"><Play class="ml-1 h-7 w-7 fill-current" /></span>
            <div class="absolute inset-x-5 bottom-5 flex items-center gap-3">
              <Play class="h-4 w-4 fill-white text-white" />
              <div class="h-1.5 flex-1 rounded-full bg-white/25"><div class="h-full w-2/5 rounded-full transition-colors" :style="{ background: demoColor }" /></div>
              <span class="text-xs font-semibold text-white/80">1:24 / 4:10</span>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              v-for="c in PLAYER_COLORS"
              :key="c"
              type="button"
              :aria-label="t('landing.player.tryColor', { color: c })"
              :aria-pressed="demoColor === c"
              class="press h-8 w-8 rounded-full ring-offset-2 ring-offset-[var(--surface-1-5)] transition hover:scale-110"
              :class="demoColor === c ? 'ring-2 ring-[var(--text-contrast)]' : ''"
              :style="{ background: c }"
              @click="demoColor = c"
            />
          </div>
        </div>
        <div class="order-1 min-w-0 lg:order-2">
          <HomeSectionHeading :eyebrow="t('landing.player.eyebrow')" :title="t('landing.player.title')" :subtitle="t('landing.player.text')" />
          <ul class="mt-7 grid gap-3 sm:grid-cols-2">
            <li v-for="p in playerPoints" :key="p.key" class="flex items-start gap-3 rounded-2xl bg-raised p-4">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-highlight text-brand"><component :is="p.icon" class="h-[18px] w-[18px]" /></span>
              <span class="min-w-0">
                <span class="block font-extrabold text-contrast">{{ t.dynamic(`landing.player.${p.key}Title`) }}</span>
                <span class="block text-sm text-secondary">{{ t.dynamic(`landing.player.${p.key}Text`) }}</span>
              </span>
            </li>
          </ul>
          <UiButton :to="user ? '/dashboard?folder=player' : '/register'" color="brand" class="mt-7">
            {{ user ? t("landing.player.ctaUser") : t("landing.player.cta") }}
            <ArrowRight />
          </UiButton>
        </div>
      </div>
    </section>

    <!-- Calculadora -->
    <section v-if="data" class="mx-auto max-w-[1280px] px-4 pb-16 sm:px-6">
      <div class="relative overflow-hidden rounded-3xl border border-divider bg-surface p-6 sm:p-10">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_100%_0%,var(--hero-glow),transparent)]" />
        <div class="relative grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div class="min-w-0">
            <span class="inline-flex items-center gap-1.5 text-sm font-bold text-brand"><Calculator class="h-4 w-4" />{{ t("landing.calc.eyebrow") }}</span>
            <h2 class="mt-2 text-3xl font-extrabold tracking-tight text-contrast">{{ t("landing.calc.title") }}</h2>
            <label class="mt-6 block">
              <span class="flex items-center justify-between gap-3 text-sm font-bold text-contrast"><span>{{ t("landing.calc.views") }}</span><span class="tabular-nums text-brand">{{ fmt.formatCount(calcViews) }}</span></span>
              <input v-model.number="calcViews" type="range" min="1000" max="1000000" step="1000" class="mt-3 w-full accent-[var(--brand)]" />
            </label>
            <div class="mt-5 flex flex-wrap gap-2">
              <button
                v-for="c in data.calculator.countries"
                :key="c.code"
                type="button"
                :aria-pressed="calcCountry === c.code"
                :class="['rounded-full px-3.5 py-1.5 text-sm font-bold transition', calcCountry === c.code ? 'bg-brand text-on-brand' : 'bg-button text-secondary hover:text-contrast']"
                @click="calcCountry = c.code"
              >
                {{ countryName(c.code) }}
              </button>
            </div>
          </div>
          <div class="min-w-0 rounded-2xl bg-raised p-6 text-center shadow-card">
            <p class="text-sm font-bold text-secondary">{{ t("landing.calc.result") }}</p>
            <p class="mt-2 text-5xl font-extrabold tabular-nums tracking-tight text-contrast" aria-live="polite">≈ {{ calcResult }}</p>
            <p class="mt-3 text-xs leading-relaxed text-secondary">{{ calcNote }}</p>
            <UiButton :to="user ? '/dashboard' : '/register'" color="brand" block class="mt-5">{{ user ? t("landing.cta.dashboard") : t("landing.calc.cta") }}<ArrowRight /></UiButton>
          </div>
        </div>
      </div>
    </section>

    <!-- Monetización -->
    <section id="monetization" class="scroll-mt-20 px-4 sm:px-6">
      <div class="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-10 overflow-hidden rounded-3xl border border-divider bg-surface p-6 sm:p-10 lg:grid-cols-2">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_70%_at_0%_0%,var(--hero-glow),transparent)]" />
        <div class="relative min-w-0">
          <HomeSectionHeading :eyebrow="t('landing.monetization.eyebrow')" :title="t('landing.monetization.title')" :subtitle="t('landing.monetization.text', { share })" />
          <ul class="mt-7 space-y-3">
            <li v-for="(p, i) in ['point1', 'point2', 'point3', 'point4']" :key="p" class="flex items-start gap-3 font-semibold text-contrast">
              <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-highlight text-brand"><Check class="h-3.5 w-3.5" /></span>
              {{ i === 0 ? t("landing.monetization.point1", { min: minPayout }) : t.dynamic(`landing.monetization.${p}`) }}
            </li>
          </ul>
          <p class="mt-7 text-sm text-secondary">
            <IntlText k="landing.monetization.terms">
              <template #link="{ text }"><NuxtLink to="/legal/monetization" class="font-semibold text-brand hover:underline">{{ text }}</NuxtLink></template>
            </IntlText>
          </p>
        </div>
        <div class="relative min-w-0 self-center rounded-2xl bg-raised p-6 shadow-card">
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-extrabold text-contrast">{{ t("landing.monetization.howTitle") }}</h3>
            <UiBadge color="brand" :dot="false">{{ t("landing.monetization.shareBadge", { share }) }}</UiBadge>
          </div>
          <ol class="mt-5 space-y-4">
            <li v-for="(step, i) in ['step1', 'step2', 'step3']" :key="step" class="flex gap-3.5">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-extrabold text-on-brand">{{ i + 1 }}</span>
              <span class="pt-1 text-[15px] font-semibold leading-snug text-contrast">{{ t.dynamic(`landing.monetization.${step}`, { share }) }}</span>
            </li>
          </ol>
          <div class="mt-6 rounded-2xl bg-button p-4">
            <p class="text-xs font-extrabold uppercase tracking-wide text-secondary">{{ t("landing.monetization.exampleTitle") }}</p>
            <p class="mt-1.5 font-semibold text-contrast">{{ t("landing.monetization.example", example) }}</p>
            <p class="mt-2 text-xs text-secondary">{{ t("landing.monetization.exampleNote") }}</p>
          </div>
          <p v-if="data && data.revenueSharePct == null" class="mt-3 text-xs text-secondary">{{ t("landing.monetization.hidden") }}</p>
        </div>
      </div>
    </section>

    <!-- Premium -->
    <section v-if="data?.premium" id="premium" class="mx-auto max-w-[1280px] scroll-mt-20 px-4 pt-24 sm:px-6">
      <div class="relative grid grid-cols-1 items-center gap-10 overflow-hidden rounded-3xl border border-divider bg-surface p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr]">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_80%_at_100%_0%,var(--premium-glow),transparent)]" />
        <div class="relative min-w-0">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-premium px-3 py-1 text-sm font-extrabold"><Crown class="h-4 w-4" />Premium</span>
          <h2 class="mt-4 text-balance text-3xl font-extrabold leading-tight text-contrast sm:text-4xl">{{ t("landing.premium.title") }}</h2>
          <p class="mt-3 max-w-xl text-lg text-secondary">{{ (data.premium.speedLimit ? t("landing.premium.text", { pct: data.premium.sharePct }) : t("landing.premium.textNoSpeed", { pct: data.premium.sharePct })) }}</p>
          <div class="mt-7 flex flex-wrap items-center gap-3">
            <UiButton to="/premium" color="premium" size="lg"><Crown />{{ t("premium.ctaFrom", { price: premiumFrom }) }}</UiButton>
            <span class="text-sm font-semibold text-secondary">{{ t("premium.cancelAnytime") }}</span>
          </div>
        </div>
        <ul class="relative grid min-w-0 gap-3">
          <li v-for="b in premiumBenefits" :key="b.key" class="flex items-start gap-3.5 rounded-2xl bg-raised p-4 shadow-card">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-premium-soft"><component :is="b.icon" class="h-5 w-5 text-premium" /></span>
            <span class="min-w-0">
              <span class="block font-extrabold text-contrast">{{ t.dynamic(`landing.premium.${b.key}Title`) }}</span>
              <span class="block text-sm text-secondary">{{ t.dynamic(`landing.premium.${b.key}Text`, { seconds: data.premium.waitSec }) }}</span>
            </span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Preguntas frecuentes -->
    <section id="faq" class="mx-auto max-w-3xl scroll-mt-20 px-4 py-24 sm:px-6">
      <HomeSectionHeading center :eyebrow="t('landing.faq.eyebrow')" :title="t('landing.faq.title')" />
      <div class="mt-12 space-y-3">
        <div v-for="n in faqOrder" :key="n" class="overflow-hidden rounded-2xl bg-raised">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-bold text-contrast"
            :aria-expanded="openFaq === n"
            @click="openFaq = openFaq === n ? null : n"
          >
            {{ t.dynamic(`landing.faq.q${n}`) }}
            <Plus :class="['h-5 w-5 shrink-0 text-secondary transition', openFaq === n ? 'rotate-45 text-brand' : '']" />
          </button>
          <div v-show="openFaq === n" class="px-5 pb-5 text-[15px] leading-relaxed text-secondary">
            <IntlText v-if="n === 6" k="landing.faq.a6">
              <template #link="{ text }"><NuxtLink to="/legal/acceptable-use" class="font-semibold text-brand hover:underline">{{ text }}</NuxtLink></template>
            </IntlText>
            <template v-else>{{ faqAnswer(n) }}</template>
          </div>
        </div>
      </div>
    </section>

    <!-- Llamada final -->
    <section class="px-4 pb-24 sm:px-6">
      <div class="relative mx-auto max-w-[1280px] overflow-hidden rounded-3xl bg-raised px-6 py-16 text-center shadow-card">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_50%_100%,var(--hero-glow),transparent)]" />
        <h2 class="relative text-3xl font-extrabold tracking-tight text-contrast sm:text-4xl">{{ t("landing.cta.title") }}</h2>
        <p class="relative mx-auto mt-4 max-w-xl text-lg text-secondary">{{ t("landing.cta.text") }}</p>
        <div class="relative mt-8 flex justify-center">
          <UiButton :to="user ? '/dashboard' : '/register'" color="brand" size="lg">
            {{ user ? t("landing.cta.dashboard") : t("landing.cta.button") }}
            <ArrowRight />
          </UiButton>
        </div>
      </div>
    </section>
  </div>
</template>
