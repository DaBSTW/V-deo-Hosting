import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido").max(254),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
});

export const registerSchema = credentialsSchema.extend({
  name: z.string().trim().max(80).optional(),
});
