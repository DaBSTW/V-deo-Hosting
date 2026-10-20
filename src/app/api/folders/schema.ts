import { z } from "zod";

export const folderNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "folderNameRequired")
    .max(60, "folderNameTooLong"),
});
