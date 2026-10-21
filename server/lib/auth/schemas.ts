import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("invalidEmail").max(254),
  password: z.string().min(8, "passwordTooShort").max(200),
});

export const registerSchema = credentialsSchema.extend({
  name: z.string().trim().max(80).optional(),
  /** Aceptación obligatoria de Términos y Privacidad. */
  acceptTerms: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).refine((v) => v, "termsRequired"),
});
