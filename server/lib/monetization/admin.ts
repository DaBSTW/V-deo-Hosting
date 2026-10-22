/** Operaciones del panel de administración de monetización. */
import type { PayoutStatus } from "@prisma/client";
import { prisma } from "#srv/prisma";
import { HttpError } from "../http";
import { flushStats } from "../videos/stats-buffer";

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

export async function getAdminSummary() {
  await flushStats();
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [credited, [v], payoutAgg, paidMonth, top] = await Promise.all([
    prisma.earningCredit.aggregate({ _sum: { amountMicros: true } }),
    prisma.$queryRaw<{ month: bigint; today: bigint }[]>`
      SELECT COALESCE(SUM("views"),0) AS month,
        COALESCE(SUM(CASE WHEN "day" = ${today}::date THEN "views" END),0) AS today
      FROM "MonetizedViewDaily" WHERE "day" >= ${monthStart}::date`,
    prisma.payout.groupBy({ by: ["status"], _sum: { amountMicros: true }, _count: true }),
    prisma.payout.aggregate({ where: { status: "PAID", processedAt: { gte: monthStart } }, _sum: { amountMicros: true } }),
    prisma.$queryRaw<{ email: string; views: bigint; credited: bigint }[]>`
      SELECT u."email", SUM(m."views") AS views,
        COALESCE((SELECT SUM(c."amountMicros") FROM "EarningCredit" c WHERE c."userId" = u."id"), 0) AS credited
      FROM "MonetizedViewDaily" m JOIN "User" u ON u."id" = m."userId"
      WHERE m."day" >= ${monthStart}::date
      GROUP BY u."id", u."email" ORDER BY views DESC LIMIT 10`,
  ]);
  const by = (s: PayoutStatus) => payoutAgg.find((p) => p.status === s);
  const committed = ["PENDING", "APPROVED", "PAID"].reduce((s, st) => s + num(by(st as PayoutStatus)?._sum.amountMicros), 0);

  return {
    /** Lo que debes a tus usuarios (acreditado en meses cerrados y aún no pagado ni solicitado). */
    liabilityMicros: num(credited._sum.amountMicros) - committed,
    /** Vistas monetizadas del mes en curso (se liquidan al cerrarlo). */
    monthViews: num(v.month),
    todayViews: num(v.today),
    pendingPayouts: { count: (by("PENDING")?._count ?? 0) + (by("APPROVED")?._count ?? 0), amountMicros: num(by("PENDING")?._sum.amountMicros) + num(by("APPROVED")?._sum.amountMicros) },
    paidThisMonthMicros: num(paidMonth._sum.amountMicros),
    topEarners: top.map((t) => ({ email: t.email, views: num(t.views), creditedMicros: num(t.credited) })),
  };
}

export async function listPayouts(status?: PayoutStatus) {
  const rows = await prisma.payout.findMany({
    where: status ? { status } : { status: { in: ["PENDING", "APPROVED"] } },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      user: {
        select: {
          email: true,
          kycStatus: true,
          verifications: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1, select: { fullName: true } },
        },
      },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    email: p.user.email,
    /** Nombre verificado: compáralo con el titular de la cuenta de destino. */
    verifiedName: p.user.kycStatus === "APPROVED" ? (p.user.verifications[0]?.fullName ?? null) : null,
    amountMicros: num(p.amountMicros),
    method: p.method,
    details: p.details,
    status: p.status,
    reference: p.reference,
    note: p.note,
    createdAt: p.createdAt.toISOString(),
  }));
}

const TRANSITIONS: Record<"approve" | "pay" | "reject", { from: PayoutStatus[]; to: PayoutStatus }> = {
  approve: { from: ["PENDING"], to: "APPROVED" },
  pay: { from: ["PENDING", "APPROVED"], to: "PAID" },
  reject: { from: ["PENDING", "APPROVED"], to: "REJECTED" },
};

export async function processPayout(id: string, action: keyof typeof TRANSITIONS, reference?: string, note?: string) {
  const t = TRANSITIONS[action];
  if (action === "pay" && !reference?.trim()) throw new HttpError(400, "payoutReferenceRequired");
  if (action === "reject" && !note?.trim()) throw new HttpError(400, "rejectReasonRequired");
  // Defensa en profundidad: nunca aprobar ni pagar a alguien sin identidad verificada.
  if (action !== "reject") {
    const p = await prisma.payout.findUnique({ where: { id }, select: { user: { select: { kycStatus: true } } } });
    if (p && p.user.kycStatus !== "APPROVED") throw new HttpError(409, "userNotVerified");
  }
  // Transición atómica: solo si el pago sigue en un estado de origen válido.
  const { count } = await prisma.payout.updateMany({
    where: { id, status: { in: t.from } },
    data: {
      status: t.to,
      ...(reference && { reference: reference.trim() }),
      ...(note && { note: note.trim() }),
      ...(t.to !== "APPROVED" && { processedAt: new Date() }),
    },
  });
  if (count === 0) throw new HttpError(409, "payoutAlreadyProcessed");
}
