import { getCoreEnv } from "#srv/env";
import { APP_NAME } from "#shared/lib/brand";
import type { AppLocale } from "#shared/i18n/config";
import type { LegalSlug } from "#shared/content/legal/links";
import { DEFAULT_SETTINGS, MIN_PAYOUT_USD, getMonetizationSettings } from "#srv/monetization/settings";
import { DEFAULT_PREMIUM, getPremiumSettings } from "#srv/premium/settings";
import { legalDocsEn } from "#shared/content/legal/en";
import { legalDocsEs } from "#shared/content/legal/es";
import type { LegalDoc, OperatorInfo } from "#shared/content/legal/types";

/** Datos del operador (variables LEGAL_* del .env) que se insertan en los textos. */
export async function operatorInfo(): Promise<OperatorInfo> {
  const settings = await getMonetizationSettings().catch(() => DEFAULT_SETTINGS);
  const premium = await getPremiumSettings().catch(() => DEFAULT_PREMIUM);
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
    revenueSharePct: settings.revenueSharePct,
    premiumMonthlyUsd: premium.plans.MONTHLY.priceUsd,
    premiumYearlyUsd: premium.plans.YEARLY.priceUsd,
    freeDownloadWaitSec: premium.freeDownloadWaitSec,
    premiumSharePct: premium.premiumSharePct,
  };
}

export async function getLegalDoc(locale: AppLocale, slug: LegalSlug): Promise<LegalDoc> {
  const docs = (locale === "es" ? legalDocsEs : legalDocsEn)(await operatorInfo());
  return docs[slug];
}
