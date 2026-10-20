/**
 * Verificación de identidad (KYC) previa al primer cobro.
 *
 * Flujo: el usuario envía datos + fotos → PENDING → un administrador revisa
 * → APPROVED (puede cobrar) o REJECTED (con motivo; puede reenviar).
 * Las imágenes se cifran antes de tocar el disco y se borran
 * KYC_RETENTION_DAYS días después de la decisión.
 */
import type { KycStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { getCoreEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { HttpError } from "../http";
import { seal, sealText, unseal, unsealText } from "./crypto";
import { deleteDocument, getDocument, putDocument } from "./storage";

export const DOCUMENT_TYPES = ["ID_CARD", "PASSPORT", "DRIVER_LICENSE"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type KycFileKind = "front" | "back" | "selfie";

const MAX_FILE_BYTES = 6 * 1024 * 1024;

const formSchema = z.object({
  fullName: z.string().trim().min(5, "kycNameInvalid").max(120),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDateInvalid")
    .refine((d) => {
      const birth = new Date(`${d}T00:00:00Z`);
      const adult = new Date(birth);
      adult.setUTCFullYear(adult.getUTCFullYear() + 18);
      return birth.getUTCFullYear() > 1900 && adult <= new Date();
    }, "mustBeAdult"),
  country: z.string().regex(/^[A-Z]{2}$/, "countryRequired"),
  documentType: z.enum(DOCUMENT_TYPES),
  documentNumber: z.string().trim().min(4, "documentNumberInvalid").max(40),
});

/** Comprueba la firma real del archivo (no fiarse del tipo declarado). */
function sniffImage(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

async function readImage(form: FormData, field: KycFileKind, required: boolean): Promise<Buffer | null> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) {
    if (required) throw new HttpError(400, "kycPhotoMissing", { file: field });
    return null;
  }
  if (file.size > MAX_FILE_BYTES) throw new HttpError(413, "kycPhotoTooLarge", { file: field });
  const buf = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(buf)) throw new HttpError(400, "kycPhotoInvalid", { file: field });
  return buf;
}

// ---------------------------------------------------------------------------
// Usuario
// ---------------------------------------------------------------------------
export async function getKycStatus(userId: string) {
  const [user, last] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true } }),
    prisma.identityVerification.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    status: user.kycStatus,
    note: last?.status === "REJECTED" ? last.note : null,
    fullName: last?.fullName ?? null,
    submittedAt: last?.createdAt.toISOString() ?? null,
    reviewedAt: last?.reviewedAt?.toISOString() ?? null,
  };
}

export async function submitVerification(userId: string, form: FormData) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { kycStatus: true } });
  if (user.kycStatus === "PENDING") throw new HttpError(409, "kycAlreadyPending");
  if (user.kycStatus === "APPROVED") throw new HttpError(409, "kycAlreadyApproved");

  const data = formSchema.parse(Object.fromEntries(["fullName", "birthDate", "country", "documentType", "documentNumber"].map((k) => [k, form.get(k) ?? ""])));
  const front = await readImage(form, "front", true);
  const back = await readImage(form, "back", data.documentType !== "PASSPORT");
  const selfie = await readImage(form, "selfie", true);

  // Cifrar y guardar; si algo falla a mitad, no dejamos archivos huérfanos.
  const saved: string[] = [];
  try {
    const files: Partial<Record<KycFileKind, string>> = {};
    for (const [kind, buf] of [["front", front], ["back", back], ["selfie", selfie]] as const) {
      if (!buf) continue;
      files[kind] = await putDocument(seal(buf));
      saved.push(files[kind]!);
    }
    await prisma.$transaction([
      prisma.identityVerification.create({
        data: {
          userId,
          fullName: data.fullName,
          birthDate: new Date(`${data.birthDate}T00:00:00Z`),
          country: data.country,
          documentType: data.documentType,
          documentNumberEnc: sealText(data.documentNumber),
          documentLast4: data.documentNumber.replace(/\s/g, "").slice(-4),
          files,
        },
      }),
      prisma.user.update({ where: { id: userId }, data: { kycStatus: "PENDING" } }),
    ]);
  } catch (err) {
    await Promise.all(saved.map(deleteDocument));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Administración
// ---------------------------------------------------------------------------
export async function listVerifications(status: KycStatus = "PENDING") {
  const rows = await prisma.identityVerification.findMany({
    where: { status },
    orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
    take: 100,
    include: { user: { select: { email: true, payoutMethod: true, payoutDetails: true } } },
  });
  return rows.map((v) => {
    const files = v.files as Partial<Record<KycFileKind, string>>;
    let documentNumber = `•••• ${v.documentLast4}`;
    try {
      documentNumber = unsealText(v.documentNumberEnc);
    } catch {
      /* clave cambiada o dato dañado: se muestra enmascarado */
    }
    return {
      id: v.id,
      email: v.user.email,
      payout: v.user.payoutMethod ? `${v.user.payoutMethod} · ${v.user.payoutDetails ?? ""}` : null,
      status: v.status,
      fullName: v.fullName,
      birthDate: v.birthDate.toISOString().slice(0, 10),
      country: v.country,
      documentType: v.documentType,
      documentNumber,
      files: v.filesPurgedAt ? [] : (Object.keys(files) as KycFileKind[]),
      note: v.note,
      createdAt: v.createdAt.toISOString(),
      reviewedAt: v.reviewedAt?.toISOString() ?? null,
    };
  });
}

export async function reviewVerification(id: string, action: "approve" | "reject", adminEmail: string, note?: string) {
  if (action === "reject" && !note?.trim()) throw new HttpError(400, "kycRejectReasonRequired");
  const v = await prisma.identityVerification.findUnique({ where: { id } });
  if (!v || v.status !== "PENDING") throw new HttpError(409, "kycAlreadyReviewed");
  const status: KycStatus = action === "approve" ? "APPROVED" : "REJECTED";
  await prisma.$transaction([
    prisma.identityVerification.update({
      where: { id },
      data: { status, note: note?.trim() || null, reviewedBy: adminEmail, reviewedAt: new Date() },
    }),
    prisma.user.update({ where: { id: v.userId }, data: { kycStatus: status } }),
  ]);
}

/** Imagen descifrada para el visor del administrador. */
export async function readVerificationFile(id: string, kind: KycFileKind) {
  const v = await prisma.identityVerification.findUnique({ where: { id } });
  const key = (v?.files as Partial<Record<KycFileKind, string>> | undefined)?.[kind];
  if (!v || !key || v.filesPurgedAt) throw new HttpError(404, "documentUnavailable");
  const plain = unseal(await getDocument(key));
  return { body: plain, contentType: sniffImage(plain) ?? "application/octet-stream" };
}

/** Borra las imágenes de verificaciones resueltas hace más de KYC_RETENTION_DAYS. */
export async function purgeOldDocuments(): Promise<number> {
  const cutoff = new Date(Date.now() - getCoreEnv().KYC_RETENTION_DAYS * 86_400_000);
  const rows = await prisma.identityVerification.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] }, reviewedAt: { lt: cutoff }, filesPurgedAt: null },
    take: 500,
  });
  for (const v of rows) {
    await Promise.all(Object.values(v.files as Record<string, string>).map(deleteDocument));
    await prisma.identityVerification.update({
      where: { id: v.id },
      data: { filesPurgedAt: new Date(), files: {} as Prisma.InputJsonValue },
    });
  }
  return rows.length;
}
