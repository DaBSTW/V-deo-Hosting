/**
 * Niveles de país para las tarifas. El país lo aporta Cloudflare en la
 * cabecera `CF-IPCountry` (sin coste ni consultas GeoIP en el VPS).
 * Ajusta las listas a lo que veas en las estadísticas reales de Monetag.
 */
export type Tier = "T1" | "T2" | "T3";
export const TIERS: Tier[] = ["T1", "T2", "T3"];

export const TIER_LABELS: Record<Tier, string> = {
  T1: "Nivel 1",
  T2: "Nivel 2",
  T3: "Nivel 3",
};

const T1 = new Set(["US", "CA", "GB", "AU", "NZ", "DE", "FR", "NL", "BE", "CH", "AT", "SE", "NO", "DK", "FI", "IE", "LU", "IS"]);
const T2 = new Set([
  "ES", "IT", "PT", "JP", "KR", "SG", "HK", "TW", "IL", "AE", "SA", "QA", "KW",
  "PL", "CZ", "GR", "SK", "SI", "EE", "LV", "LT", "MX", "CL", "UY", "AR", "BR",
]);

export const TIER_COUNTRIES: Record<Tier, string> = {
  T1: [...T1].join(", "),
  T2: [...T2].join(", "),
  T3: "Resto del mundo",
};

export function tierOf(country: string | null | undefined): Tier {
  const c = (country ?? "").toUpperCase();
  if (T1.has(c)) return "T1";
  if (T2.has(c)) return "T2";
  return "T3";
}
