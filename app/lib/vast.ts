/**
 * Cliente VAST mínimo para el pre-roll (VAST 2/3/4: InLine y Wrapper).
 *
 * Se ejecuta en el navegador del espectador: la etiqueta, el video del
 * anuncio y los píxeles de seguimiento van directos a la red publicitaria
 * (si pasaran por el VPS, la red vería nuestra IP y lo marcaría como tráfico
 * no válido). Solo se usan MediaFiles progresivos (MP4/WebM) que el navegador
 * pueda reproducir; sin VPAID ni JavaScript de terceros dentro del reproductor.
 */

export type VastEvent = "start" | "firstQuartile" | "midpoint" | "thirdQuartile" | "complete" | "skip" | "mute" | "unmute" | "pause" | "resume";

export interface VastAd {
  mediaUrl: string;
  /** Duración declarada (s); puede ser 0 si falta. */
  duration: number;
  /** Segundos tras los que se puede saltar (`null` = la etiqueta no lo indica). */
  skipOffset: number | null;
  clickThrough: string | null;
  clickTracking: string[];
  impressions: string[];
  errors: string[];
  tracking: Partial<Record<VastEvent, string[]>>;
}

const MAX_WRAPPERS = 5;

/** Sustituye las macros habituales de las etiquetas VAST. */
export function fillMacros(url: string, extra: Record<string, string> = {}): string {
  const cb = String(Math.floor(Math.random() * 1e10));
  const page = typeof document !== "undefined" ? document.referrer || location.href : "";
  const domain = (() => {
    try {
      return new URL(page).hostname;
    } catch {
      return "";
    }
  })();
  const values: Record<string, string> = {
    CACHEBUSTING: cb,
    CACHEBUSTER: cb,
    CB: cb,
    RANDOM: cb,
    TIMESTAMP: String(Date.now()),
    PAGEURL: page,
    PAGE_URL: page,
    REFERRER_URL: page,
    REFERRER: page,
    DOMAIN: domain,
    ...extra,
  };
  return url.replace(/\[([A-Z_]+)\]|\{([A-Z_]+)\}|%%([A-Z_]+)%%/g, (m, a, b, c) => {
    const key = (a ?? b ?? c) as string;
    return key in values ? encodeURIComponent(values[key]) : m;
  });
}

/** Píxel de seguimiento (petición GET sin esperar respuesta). */
export function ping(urls: string[] | undefined, extra?: Record<string, string>) {
  for (const u of urls ?? []) {
    try {
      new Image().src = fillMacros(u, extra);
    } catch {
      /* ignorado */
    }
  }
}

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? "";
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map(text).filter(Boolean);

/** «HH:MM:SS(.mmm)» → segundos. */
function seconds(v: string): number {
  const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(v.trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

function parseSkip(v: string | null, duration: number): number | null {
  if (!v) return null;
  if (v.endsWith("%")) return (duration * Number(v.slice(0, -1))) / 100;
  return seconds(v) || null;
}

interface Collected {
  impressions: string[];
  errors: string[];
  clickTracking: string[];
  tracking: Partial<Record<VastEvent, string[]>>;
}

function collect(ad: Element, acc: Collected) {
  acc.impressions.push(...texts(ad, "Impression"));
  acc.errors.push(...texts(ad, "Error"));
  acc.clickTracking.push(...texts(ad, "Linear VideoClicks ClickTracking"));
  for (const t of ad.querySelectorAll("Linear TrackingEvents Tracking")) {
    const ev = t.getAttribute("event") as VastEvent | null;
    const url = text(t);
    if (ev && url) (acc.tracking[ev] ??= []).push(url);
  }
}

/** Elige el MediaFile progresivo reproducible más cercano a 720p. */
function pickMedia(linear: Element, canPlay: (type: string) => boolean): string | null {
  const files = [...linear.querySelectorAll("MediaFiles MediaFile")]
    .map((m) => ({
      url: text(m),
      type: (m.getAttribute("type") ?? "").toLowerCase(),
      delivery: (m.getAttribute("delivery") ?? "progressive").toLowerCase(),
      height: Number(m.getAttribute("height")) || 0,
      api: m.getAttribute("apiFramework"),
    }))
    .filter((f) => f.url.startsWith("https://") || f.url.startsWith("http://"))
    .filter((f) => f.delivery === "progressive" && !f.api && canPlay(f.type));
  files.sort((a, b) => Math.abs((a.height || 720) - 720) - Math.abs((b.height || 720) - 720));
  return files[0]?.url ?? null;
}

async function fetchXml(url: string, signal: AbortSignal): Promise<Document> {
  const res = await fetch(fillMacros(url), { signal, credentials: "omit", mode: "cors" });
  if (!res.ok) throw new Error(`VAST ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("VAST XML inválido");
  return doc;
}

/**
 * Descarga y resuelve la etiqueta (siguiendo Wrappers). `null` si no hay
 * anuncio reproducible o tarda más de `timeoutMs`; nunca lanza.
 */
export async function loadVast(tagUrl: string, opts: { timeoutMs: number; canPlay: (type: string) => boolean }): Promise<VastAd | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  const acc: Collected = { impressions: [], errors: [], clickTracking: [], tracking: {} };
  try {
    let url = tagUrl;
    for (let depth = 0; depth <= MAX_WRAPPERS; depth++) {
      const doc = await fetchXml(url, ctrl.signal);
      const ad = doc.querySelector("VAST > Ad");
      if (!ad) {
        // VAST vacío (sin inventario): se avisa a la red por si lo pide.
        ping(texts(doc.documentElement, "VAST > Error"), { ERRORCODE: "303" });
        return null;
      }
      const wrapper = ad.querySelector("Wrapper");
      if (wrapper) {
        collect(wrapper, acc);
        url = text(wrapper.querySelector("VASTAdTagURI"));
        if (!url) return null;
        continue;
      }
      const inline = ad.querySelector("InLine");
      const linear = inline?.querySelector("Creatives Creative Linear");
      if (!inline || !linear) return null;
      collect(inline, acc);
      const mediaUrl = pickMedia(linear, opts.canPlay);
      if (!mediaUrl) {
        ping(acc.errors, { ERRORCODE: "403" });
        return null;
      }
      const duration = seconds(text(linear.querySelector("Duration")));
      return {
        mediaUrl,
        duration,
        skipOffset: parseSkip(linear.getAttribute("skipoffset"), duration),
        clickThrough: text(linear.querySelector("VideoClicks ClickThrough")) || null,
        ...acc,
      };
    }
    ping(acc.errors, { ERRORCODE: "302" });
    return null;
  } catch {
    ping(acc.errors, { ERRORCODE: "301" });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
