/**
 * Formateadores dependientes del idioma (números, fechas, moneda…).
 * En componentes cliente usa `useFormat()` (src/i18n/useFormat.ts); en el
 * servidor, `makeFormatters(locale)`.
 */
export function makeFormatters(locale: string) {
  const num1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const num0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const usd2 = new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd4 = new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const dateTime = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const shortDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exp;
    return `${(exp >= 2 ? num1 : num0).format(value)} ${units[exp]}`;
  };

  const formatDuration = (totalSec: number | null | undefined): string => {
    if (totalSec == null || !Number.isFinite(totalSec) || totalSec <= 0) return "—";
    const s = Math.round(totalSec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  };

  /** 1234 → "1.234"; ≥ 10 000 → "12,3 mil" / "12.3K". */
  const formatCount = (n: number) => (Math.abs(n) >= 10_000 ? compact.format(n) : num0.format(n));

  return {
    formatBytes,
    formatDuration,
    formatCount,
    formatDate: (iso: string) => dateTime.format(new Date(iso)),
    /** "hace 5 min" / "5 minutes ago" (fecha corta tras 30 días). */
    formatRelative: (iso: string): string => {
      const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
      const abs = Math.abs(diffSec);
      if (abs < 60) return rtf.format(0, "second");
      if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
      if (abs < 30 * 86400) return rtf.format(Math.round(diffSec / 86400), "day");
      return shortDate.format(new Date(iso));
    },
    /** "3 h 12 min", "45 min", "30 s". */
    formatLongDuration: (totalSec: number): string => {
      if (!totalSec || totalSec < 1) return "0 min";
      const h = Math.floor(totalSec / 3600);
      const m = Math.round((totalSec % 3600) / 60);
      if (h > 0) return m ? `${formatCount(h)} h ${m} min` : `${formatCount(h)} h`;
      if (m > 0) return `${m} min`;
      return `${Math.round(totalSec)} s`;
    },
    /** "2026-10-12" (UTC) → "12 oct" / "Oct 12". */
    formatDay: (isoDate: string, withWeekday = false): string =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(withWeekday && { weekday: "short" }), timeZone: "UTC" }).format(
        new Date(`${isoDate}T00:00:00Z`),
      ),
    /** Importe en USD desde micro-dólares. */
    formatMicros: (micros: number, precise = false): string => {
      const usd = micros / 1e6;
      if (!precise && usd > 0 && usd < 0.01) return `< ${usd2.format(0.01)}`;
      return (precise ? usd4 : usd2).format(usd);
    },
    formatUsd: (usd: number, precise = false) => (precise ? usd4 : usd2).format(usd),
  };
}

export type Formatters = ReturnType<typeof makeFormatters>;
