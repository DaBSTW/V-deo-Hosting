import { getCoreEnv } from "@/lib/env";
import { APP_NAME } from "@/lib/brand";
import type { AppLocale } from "@/i18n/config";
import type { LegalSlug } from "@/components/legal/links";
import { MIN_PAYOUT_USD } from "@/server/monetization/settings";
import { legalDocsEn } from "./en";
import { legalDocsEs } from "./es";
import type { LegalDoc, OperatorInfo } from "./types";

/** Datos del operador (variables LEGAL_* del .env) que se insertan en los textos. */
export function operatorInfo(): OperatorInfo {
  const env = getCoreEnv();
  return {
    app: APP_NAME,
    entity: env.LEGAL_ENTITY_NAME || APP_NAME,
    url: env.APP_URL,
    email: env.LEGAL_CONTACT_EMAIL,
    dmcaEmail: env.LEGAL_DMCA_EMAIL || env.LEGAL_CONTACT_EMAIL,
    address: env.LEGAL_ADDRESS,
    jurisdiction: env.LEGAL_JURISDICTION,
    kycRetentionDays: env.KYC_RETENTION_DAYS,
    minPayoutUsd: MIN_PAYOUT_USD,
  };
}

export function getLegalDoc(locale: AppLocale, slug: LegalSlug): LegalDoc {
  const docs = (locale === "es" ? legalDocsEs : legalDocsEn)(operatorInfo());
  return docs[slug];
}
