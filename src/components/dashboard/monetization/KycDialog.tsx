"use client";

import { useMemo, useState, type FormEvent } from "react";
import { prepareIdPhoto } from "@/lib/image-prep";
import { Modal } from "../../ui/Modal";
import { CheckIcon, LockIcon, UploadIcon } from "../../ui/icons";
import { inputCls } from "./ui";

// ISO 3166-1 alfa-2 (los nombres los traduce el navegador con Intl.DisplayNames).
const COUNTRY_CODES =
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KM KN KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PR PS PT PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS SV SY SZ TD TG TH TJ TL TM TN TO TR TT TW TZ UA UG US UY UZ VC VE VN VU WS YE ZA ZM ZW".split(" ");

const DOC_TYPES = [
  { id: "ID_CARD", label: "Documento de identidad" },
  { id: "PASSPORT", label: "Pasaporte" },
  { id: "DRIVER_LICENSE", label: "Licencia de conducir" },
] as const;

type Kind = "front" | "back" | "selfie";
const PHOTO_HELP: Record<Kind, { title: string; hint: string }> = {
  front: { title: "Frente del documento", hint: "Las 4 esquinas visibles, sin reflejos y legible." },
  back: { title: "Dorso del documento", hint: "La parte trasera completa." },
  selfie: { title: "Selfie con el documento", hint: "Tu cara y el documento junto a ella, ambos nítidos." },
};

export function KycDialog({
  open,
  onClose,
  onSubmitted,
  firstPayout,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  firstPayout: boolean;
}) {
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]["id"]>("ID_CARD");
  const [photos, setPhotos] = useState<Partial<Record<Kind, { file: File; preview: string }>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames(["es"], { type: "region" });
    return COUNTRY_CODES.map((c) => ({ code: c, name: names.of(c) ?? c })).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, []);

  const kinds: Kind[] = docType === "PASSPORT" ? ["front", "selfie"] : ["front", "back", "selfie"];

  async function pick(kind: Kind, file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const prepared = await prepareIdPhoto(file);
      setPhotos((p) => {
        if (p[kind]) URL.revokeObjectURL(p[kind]!.preview);
        return { ...p, [kind]: { file: prepared, preview: URL.createObjectURL(prepared) } };
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const missing = kinds.find((k) => !photos[k]);
    if (missing) return setError(`Falta la foto: ${PHOTO_HELP[missing].title}`);
    const form = new FormData(e.currentTarget);
    form.set("documentType", docType);
    for (const k of kinds) form.set(k, photos[k]!.file);
    setBusy(true);
    try {
      const res = await fetch("/api/kyc", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details?.[0] ?? data.error ?? "No se pudo enviar la verificación");
      Object.values(photos).forEach((p) => p && URL.revokeObjectURL(p.preview));
      setPhotos({});
      onSubmitted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Verificación de identidad" size="md">
      <form onSubmit={submit} className="space-y-5 p-5">
        <div className="flex gap-3 rounded-xl bg-brand-50 p-3.5 text-sm text-brand-900">
          <LockIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {firstPayout ? "Antes de tu primer pago necesitamos confirmar tu identidad. " : ""}
            Es un paso único. Tus documentos se guardan <strong>cifrados</strong>, solo los revisa el equipo de pagos y se
            eliminan tras la revisión. El titular de tu método de cobro debe coincidir con este nombre.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-zinc-600 sm:col-span-2">
            Nombre completo (como aparece en el documento)
            <input name="fullName" required minLength={5} maxLength={120} autoComplete="name" className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Fecha de nacimiento
            <input name="birthDate" type="date" required max={new Date().toISOString().slice(0, 10)} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            País de residencia
            <select name="country" required defaultValue="" className={`mt-1 ${inputCls}`}>
              <option value="" disabled>Selecciona…</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-zinc-600">Tipo de documento</p>
          <div className="grid grid-cols-3 gap-2">
            {DOC_TYPES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDocType(d.id)}
                aria-pressed={docType === d.id}
                className={`rounded-xl border px-2 py-2.5 text-xs font-medium transition ${
                  docType === d.id ? "border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500" : "border-zinc-200 text-zinc-700 hover:border-zinc-300"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-xs font-medium text-zinc-600">
            Número de documento
            <input name="documentNumber" required minLength={4} maxLength={40} autoComplete="off" className={`mt-1 ${inputCls}`} />
          </label>
        </div>

        <div className={`grid gap-3 ${kinds.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {kinds.map((k) => (
            <label
              key={k}
              className={`group relative flex aspect-[4/3] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-center transition ${
                photos[k] ? "border-emerald-400" : "border-zinc-300 hover:border-brand-400 hover:bg-brand-50/40"
              }`}
            >
              {photos[k] ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photos[k]!.preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    <CheckIcon className="h-3 w-3" /> {PHOTO_HELP[k].title}
                  </span>
                </>
              ) : (
                <span className="px-3">
                  <UploadIcon className="mx-auto h-5 w-5 text-zinc-400" />
                  <span className="mt-1.5 block text-xs font-medium text-zinc-700">{PHOTO_HELP[k].title}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{PHOTO_HELP[k].hint}</span>
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                capture={k === "selfie" ? "user" : "environment"}
                className="sr-only"
                onChange={(e) => void pick(k, e.target.files?.[0])}
              />
            </label>
          ))}
        </div>

        <label className="flex items-start gap-2.5 text-xs text-zinc-600">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-zinc-300" />
          Confirmo que los datos son verdaderos y acepto que se usen solo para verificar mi identidad y procesar mis pagos.
        </label>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">Cancelar</button>
          <button disabled={busy || !consent} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? "Enviando…" : "Enviar verificación"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
