<script setup lang="ts">
/** Verificación de identidad (antes del primer cobro). Las fotos se limpian de EXIF en el navegador. */
import { Check, Lock, Upload } from "lucide-vue-next";
import { prepareIdPhoto } from "~/lib/image-prep";

const props = defineProps<{ open: boolean; firstPayout: boolean }>();
const emit = defineEmits<{ close: []; submitted: [] }>();
const { t, locale } = useI18n();

// ISO 3166-1 alfa-2 (los nombres los traduce el navegador con Intl.DisplayNames).
const COUNTRY_CODES =
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KM KN KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PR PS PT PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS SV SY SZ TD TG TH TJ TL TM TN TO TR TT TW TZ UA UG US UY UZ VC VE VN VU WS YE ZA ZM ZW".split(" ");
const DOC_TYPES = ["ID_CARD", "PASSPORT", "DRIVER_LICENSE"] as const;
type Kind = "front" | "back" | "selfie";

const docType = ref<(typeof DOC_TYPES)[number]>("ID_CARD");
const photos = ref<Partial<Record<Kind, { file: File; preview: string }>>>({});
const error = ref<string | null>(null);
const busy = ref(false);
const consent = ref(false);
const form = ref<HTMLFormElement>();

const countries = computed(() => {
  const names = new Intl.DisplayNames([locale.value], { type: "region" });
  return COUNTRY_CODES.map((c) => ({ code: c, name: names.of(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name, locale.value));
});
const kinds = computed<Kind[]>(() => (docType.value === "PASSPORT" ? ["front", "selfie"] : ["front", "back", "selfie"]));
const today = new Date().toISOString().slice(0, 10);

async function pick(kind: Kind, file: File | undefined) {
  if (!file) return;
  error.value = null;
  try {
    const prepared = await prepareIdPhoto(file);
    const prev = photos.value[kind];
    if (prev) URL.revokeObjectURL(prev.preview);
    photos.value = { ...photos.value, [kind]: { file: prepared, preview: URL.createObjectURL(prepared) } };
  } catch (err) {
    const code = (err as Error).message;
    error.value = t.has(`kyc.photoErrors.${code}`) ? t.dynamic(`kyc.photoErrors.${code}`) : t("kyc.photoErrors.processFailed");
  }
}

async function submit() {
  if (!form.value) return;
  error.value = null;
  const missing = kinds.value.find((k) => !photos.value[k]);
  if (missing) return (error.value = t("kyc.missingPhoto", { photo: t.dynamic(`kyc.photos.${missing}.title`) }));
  const data = new FormData(form.value);
  data.set("documentType", docType.value);
  for (const k of kinds.value) data.set(k, photos.value[k]!.file);
  busy.value = true;
  try {
    await api("/api/kyc", { method: "POST", body: data });
    Object.values(photos.value).forEach((p) => p && URL.revokeObjectURL(p.preview));
    photos.value = {};
    emit("submitted");
  } catch (err) {
    error.value = (err as Error).message || t("kyc.submitFailed");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UiModal :open="props.open" :title="t('kyc.title')" size="md" @close="emit('close')">
    <form ref="form" class="space-y-5 px-5 pb-5 pt-1" @submit.prevent="submit">
      <div class="flex gap-3 rounded-xl bg-brand-soft p-3.5 text-sm text-contrast">
        <Lock class="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p>
          <template v-if="firstPayout">{{ t("kyc.firstPayout") }} </template>
          <IntlText k="kyc.intro">
            <template #strong="{ text }"><strong class="font-extrabold">{{ text }}</strong></template>
          </IntlText>
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="label">{{ t("kyc.fullName") }}</span>
          <input name="fullName" required minlength="5" maxlength="120" autocomplete="name" class="input" />
        </label>
        <label class="block">
          <span class="label">{{ t("kyc.birthDate") }}</span>
          <input name="birthDate" type="date" required :max="today" class="input" />
        </label>
        <label class="block">
          <span class="label">{{ t("kyc.country") }}</span>
          <select name="country" required class="input">
            <option value="" disabled selected>{{ t("kyc.select") }}</option>
            <option v-for="c in countries" :key="c.code" :value="c.code">{{ c.name }}</option>
          </select>
        </label>
      </div>

      <div>
        <p class="label">{{ t("kyc.documentType") }}</p>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="d in DOC_TYPES"
            :key="d"
            type="button"
            :aria-pressed="docType === d"
            :class="[
              'rounded-xl border px-2 py-2.5 text-xs font-bold transition',
              docType === d ? 'border-brand bg-brand-highlight text-brand' : 'border-divider bg-button text-primary hover:text-contrast',
            ]"
            @click="docType = d"
          >
            {{ t(`kyc.documentTypes.${d}`) }}
          </button>
        </div>
        <label class="mt-3 block">
          <span class="label">{{ t("kyc.documentNumber") }}</span>
          <input name="documentNumber" required minlength="4" maxlength="40" autocomplete="off" class="input" />
        </label>
      </div>

      <div :class="['grid gap-3', kinds.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2']">
        <label
          v-for="k in kinds"
          :key="k"
          :class="[
            'group relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-center transition',
            photos[k] ? 'border-brand' : 'border-divider hover:border-brand hover:bg-brand-soft',
          ]"
        >
          <template v-if="photos[k]">
            <img :src="photos[k]!.preview" alt="" class="absolute inset-0 h-full w-full object-cover" />
            <span class="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-brand px-1.5 py-0.5 text-[11px] font-bold text-on-brand">
              <Check class="h-3 w-3" /> {{ t.dynamic(`kyc.photos.${k}.title`) }}
            </span>
          </template>
          <span v-else class="px-3">
            <Upload class="mx-auto h-5 w-5 text-secondary" />
            <span class="mt-1.5 block text-xs font-bold text-contrast">{{ t.dynamic(`kyc.photos.${k}.title`) }}</span>
            <span class="mt-0.5 block text-[11px] leading-snug text-secondary">{{ t.dynamic(`kyc.photos.${k}.hint`) }}</span>
          </span>
          <input
            type="file"
            accept="image/*"
            :capture="k === 'selfie' ? 'user' : 'environment'"
            class="sr-only"
            @change="pick(k, ($event.target as HTMLInputElement).files?.[0])"
          />
        </label>
      </div>

      <label class="flex items-start gap-2.5 text-sm text-primary">
        <input v-model="consent" type="checkbox" class="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]" />
        <span>
          <IntlText k="kyc.consent">
            <template #privacy="{ text }"><NuxtLink to="/legal/privacy" target="_blank" class="font-semibold text-brand hover:underline">{{ text }}</NuxtLink></template>
          </IntlText>
        </span>
      </label>

      <p v-if="error" role="alert" class="rounded-xl bg-red-soft px-3.5 py-2.5 text-sm font-semibold text-red">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <UiButton color="transparent" @click="emit('close')">{{ t("common.cancel") }}</UiButton>
        <UiButton type="submit" color="brand" :disabled="busy || !consent">{{ busy ? t("kyc.sending") : t("kyc.submit") }}</UiButton>
      </div>
    </form>
  </UiModal>
</template>
