import { z } from "zod";

export const subjectCreateSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  imageUrl: z.string().trim().url("Enter a valid URL").max(500).optional().or(z.literal("")),
  durationMin: z.coerce
    .number()
    .int("Duration must be a whole number")
    .min(1, "Duration must be at least 1 minute")
    .max(600, "Duration cannot exceed 600 minutes"),
  passMark: z.coerce
    .number()
    .int("Pass mark must be a whole number")
    .min(1, "Pass mark must be at least 1%")
    .max(100, "Pass mark cannot exceed 100%"),
  isPublished: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

export const subjectUpdateSchema = subjectCreateSchema.partial();

/** Publish/activate toggles are their own endpoint-level payload. */
export const subjectStatusSchema = z
  .object({
    isPublished: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.isPublished !== undefined || v.isActive !== undefined, {
    message: "Provide isPublished or isActive",
  });

export type SubjectCreateInput = z.infer<typeof subjectCreateSchema>;
export type SubjectUpdateInput = z.infer<typeof subjectUpdateSchema>;
