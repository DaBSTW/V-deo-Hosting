import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/server/auth/admin";
import { readJson, route } from "@/server/http";
import { listVerifications, reviewVerification } from "@/server/kyc/service";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ action: z.enum(["approve", "reject"]), note: z.string().max(500).optional() });

/** PATCH /api/admin/kyc/:id — aprobar o rechazar (con motivo). */
export const PATCH = route<Ctx>(async (req, ctx) => {
  const admin = await requireApiAdmin();
  const { action, note } = schema.parse(await readJson(req));
  await reviewVerification((await ctx.params).id, action, admin.email, note);
  return NextResponse.json({ verifications: await listVerifications("PENDING") });
});
