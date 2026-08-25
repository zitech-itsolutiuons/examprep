import { z } from "zod";

/** Admin-side patch for another account. Deliberately narrow — no password or email edits. */
export const adminUserUpdateSchema = z
  .object({
    role: z.enum(["STUDENT", "ADMIN"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.role !== undefined || value.isActive !== undefined, {
    message: "Nothing to update",
  });

export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
