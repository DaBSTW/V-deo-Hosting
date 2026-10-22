import { z } from "zod";
import { requireApiAdmin } from "#srv/auth/admin";
import { handler, json, methods, readJson } from "#srv/http";
import { COUNTRY_RE, closeSettlement, getSettlementMonth, previewSettlement } from "#srv/monetization/settlement";

const usd = z.number().min(0).max(1000);
const schema = z.object({
  /** RPM real por país (USD por 1.000 vistas), copiado del panel de Monetag. */
  rpm: z.record(z.string().regex(COUNTRY_RE), usd).refine((m) => Object.keys(m).length <= 300),
  defaultRpm: usd,
  /** Ingresos totales del mes en Monetag (USD): activa el tope del reparto. */
  revenue: z.number().min(0).max(10_000_000).nullish(),
  /** `false` = solo calcular (vista previa); `true` = cerrar el mes y acreditar. */
  confirm: z.boolean().default(false),
});

/** GET /api/admin/settlements/:month — vistas del mes por país y el cierre, si existe. */
const GET = handler(async (req) => {
  await requireApiAdmin();
  return json(await getSettlementMonth(req.params.month));
});

/** POST /api/admin/settlements/:month — vista previa o cierre del mes. */
const POST = handler(async (req) => {
  const admin = await requireApiAdmin();
  const { confirm, ...input } = schema.parse(await readJson(req));
  const month = req.params.month;
  return json(confirm ? { closed: true, ...(await closeSettlement(month, input, admin.email)) } : await previewSettlement(month, input));
});

export default methods({ GET, POST });
