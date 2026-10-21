import { requireApiAdmin } from "#srv/auth/admin";
import { HttpError, handler, methods } from "#srv/http";
import { readVerificationFile, type KycFileKind } from "#srv/kyc/service";

const KINDS = new Set<KycFileKind>(["front", "back", "selfie"]);

/** GET /api/admin/kyc/:id/file/:kind — documento descifrado, solo para administradores. */
const GET = handler(async (req) => {
  await requireApiAdmin();
  const { id, kind } = req.params;
  if (!KINDS.has(kind as KycFileKind)) throw new HttpError(404, "documentUnavailable");
  const { body, contentType } = await readVerificationFile(id, kind as KycFileKind);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      // Datos personales: nunca en cachés ni indexados.
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Robots-Tag": "noindex",
    },
  });
});

export default methods({ GET });
