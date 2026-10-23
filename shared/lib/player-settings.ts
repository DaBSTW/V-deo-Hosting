/**
 * Personalización del reproductor de cada creador (Panel → Reproductor).
 * Se aplica en /v y /embed a todos sus videos. Sin dependencias: lo usan el
 * servidor (que valida con Zod) y el navegador.
 */
export const WATERMARK_POSITIONS = ["tl", "tr", "bl", "br"] as const;
export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

export interface PlayerSettings {
  /** Color de los controles (#rrggbb). */
  color: string;
  watermark: {
    type: "none" | "text" | "image";
    /** Texto de la marca de agua (p. ej. el nombre del canal). */
    text: string;
    /** Logo en HTTPS (PNG/SVG/WebP con fondo transparente). */
    imageUrl: string;
    /** Enlace opcional al pulsar la marca de agua (HTTPS). */
    link: string;
    position: WatermarkPosition;
    /** Opacidad en % (20–100). */
    opacity: number;
  };
  /** Solo en reproductores insertados: empezar en silencio automáticamente. */
  autoplay: boolean;
  loop: boolean;
  /** Título del video arriba en el reproductor insertado. */
  showTitle: boolean;
  /** Recordar por dónde iba cada espectador. */
  resume: boolean;
  /** Controles opcionales. */
  speed: boolean;
  pip: boolean;
}

export const PLAYER_COLORS = ["#1bd96a", "#4f9cff", "#c78aff", "#ff496e", "#ffa347", "#f5d90a", "#22d3ee", "#ffffff"] as const;

export const DEFAULT_PLAYER: PlayerSettings = {
  color: "#1bd96a",
  watermark: { type: "none", text: "", imageUrl: "", link: "", position: "tr", opacity: 70 },
  autoplay: false,
  loop: false,
  showTitle: true,
  resume: true,
  speed: true,
  pip: true,
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Mezcla lo guardado con los valores por defecto (tolera datos antiguos o incompletos). */
export function resolvePlayer(raw: unknown): PlayerSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PlayerSettings>;
  const w = (r.watermark ?? {}) as Partial<PlayerSettings["watermark"]>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const https = (v: unknown) => (typeof v === "string" && v.startsWith("https://") ? v.slice(0, 500) : "");
  return {
    color: typeof r.color === "string" && HEX.test(r.color) ? r.color.toLowerCase() : DEFAULT_PLAYER.color,
    watermark: {
      type: w.type === "text" || w.type === "image" ? w.type : "none",
      text: str(w.text, 40),
      imageUrl: https(w.imageUrl),
      link: https(w.link),
      position: WATERMARK_POSITIONS.includes(w.position as WatermarkPosition) ? (w.position as WatermarkPosition) : DEFAULT_PLAYER.watermark.position,
      opacity: Math.min(100, Math.max(20, Math.round(Number(w.opacity) || DEFAULT_PLAYER.watermark.opacity))),
    },
    autoplay: bool(r.autoplay, DEFAULT_PLAYER.autoplay),
    loop: bool(r.loop, DEFAULT_PLAYER.loop),
    showTitle: bool(r.showTitle, DEFAULT_PLAYER.showTitle),
    resume: bool(r.resume, DEFAULT_PLAYER.resume),
    speed: bool(r.speed, DEFAULT_PLAYER.speed),
    pip: bool(r.pip, DEFAULT_PLAYER.pip),
  };
}

/** Texto legible sobre el color elegido (negro o blanco). */
export function contrastOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#000000" : "#ffffff";
}
