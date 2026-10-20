import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { HttpError, route } from "@/server/http";
import { getKycStatus, submitVerification } from "@/server/kyc/service";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/kyc — estado de la verificación de identidad del usuario. */
export const GET = route(async () => {
  const user = await requireApiUser();
  return NextResponse.json(await getKycStatus(user.id));
});

/**
 * POST /api/kyc (multipart/form-data)
 * fullName, birthDate (AAAA-MM-DD), country (ISO-2), documentType,
 * documentNumber, front, back (no requerido con pasaporte), selfie.
 */
export const POST = route(async (req) => {
  const user = await requireApiUser();
  rateLimit(`kyc:${user.id}`, 5, 24 * 3600 * 1000);
  if (Number(req.headers.get("content-length") ?? 0) > 20 * 1024 * 1024) {
    throw new HttpError(413, "Las fotos son demasiado grandes");
  }
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Formulario inválido");
  });
  await submitVerification(user.id, form);
  return NextResponse.json(await getKycStatus(user.id), { status: 201 });
});
