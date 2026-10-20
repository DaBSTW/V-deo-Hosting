// Utilidades de formato compartidas entre servidor y cliente (sin dependencias).

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toFixed(exp >= 2 ? 1 : 0)} ${units[exp]}`;
}

export function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec == null || !Number.isFinite(totalSec) || totalSec <= 0) return "—";
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

/** "hace 5 min", "ayer", "hace 3 días"… (cae a fecha corta tras 30 días). */
export function formatRelative(iso: string): string {
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 60) return "ahora mismo";
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 30 * 86400) return rtf.format(Math.round(diffSec / 86400), "day");
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

const compactFmt = new Intl.NumberFormat("es", { notation: "compact", maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("es");

/** 1234 → "1,2 mil" (a partir de 10 000; por debajo, con separador de miles). */
export const formatCount = (n: number) => (Math.abs(n) >= 10_000 ? compactFmt.format(n) : intFmt.format(n));

/** Duración larga legible: "3 h 12 min", "45 min", "30 s". */
export function formatLongDuration(totalSec: number): string {
  if (!totalSec || totalSec < 1) return "0 min";
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h > 0) return m ? `${formatCount(h)} h ${m} min` : `${formatCount(h)} h`;
  if (m > 0) return `${m} min`;
  return `${Math.round(totalSec)} s`;
}

/** "2026-10-12" (UTC) → "12 oct" / "lun, 12 oct". */
export function formatDay(isoDate: string, withWeekday = false): string {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    ...(withWeekday && { weekday: "short" }),
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

const usd2 = new Intl.NumberFormat("es", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd4 = new Intl.NumberFormat("es", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Importe en USD. `micros` = millonésimas de dólar (como se guardan en la DB). */
export function formatMicros(micros: number, precise = false): string {
  const usd = micros / 1e6;
  if (!precise && usd > 0 && usd < 0.01) return `< ${usd2.format(0.01)}`;
  return (precise ? usd4 : usd2).format(usd);
}
export const formatUsd = (usd: number, precise = false) => (precise ? usd4 : usd2).format(usd);
