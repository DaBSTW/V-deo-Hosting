import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/server/auth/admin";
import { errorResponse, HttpError } from "@/server/http";
import { readVerificationFile, type KycFileKind } from "@/server/kyc/service";

type Ctx = { params: Promise<{ id: string; kind: string }> };
const KINDS = new Set<KycFileKind>(["front", "back", "selfie"]);

/** GET /api/admin/kyc/:id/file/:kind — documento descifrado, solo para administradores. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireApiAdmin();
    const { id, kind } = await ctx.params;
    if (!KINDS.has(kind as KycFileKind)) throw new HttpError(404, "Documento no disponible");
    const { body, contentType } = await readVerificationFile(id, kind as KycFileKind);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        // Datos personales: nunca en cachés ni indexados.
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
