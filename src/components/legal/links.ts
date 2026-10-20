/** Páginas legales (el orden es el del footer y el índice). */
export const LEGAL_SLUGS = ["terms", "privacy", "cookies", "copyright", "acceptable-use", "monetization"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
export const isLegalSlug = (v: string): v is LegalSlug => (LEGAL_SLUGS as readonly string[]).includes(v);
