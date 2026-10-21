import { isLegalSlug, LEGAL_SLUGS } from "#shared/content/legal/links";
import { isLocale } from "#shared/i18n/config";
import { getCoreEnv } from "#srv/env";
import { handler, HttpError, json, methods } from "#srv/http";
import { localeFromRequest } from "#srv/i18n";
import { getLegalDoc } from "#srv/legal";

/** GET /api/public/legal/:slug — documento legal en el idioma del visitante. */
const GET = handler(async (req) => {
  const { slug } = req.params;
  if (!isLegalSlug(slug)) throw new HttpError(404, "documentUnavailable");
  return json({
    slug,
    slugs: LEGAL_SLUGS,
    // `?locale=` permite pedir otro idioma sin recargar (selector de idioma).
    doc: getLegalDoc(isLocale(req.nextUrl.searchParams.get("locale")) ? (req.nextUrl.searchParams.get("locale") as "es" | "en") : localeFromRequest(req), slug),
    updated: getCoreEnv().LEGAL_LAST_UPDATED,
  });
});

export default methods({ GET });
