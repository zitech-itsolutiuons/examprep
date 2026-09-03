import { z } from "zod";

import { id as idSchema } from "@/server/validators/id";

const optionSchema = z.object({
  id: idSchema().optional(), // present when editing an existing option
  text: z.string().trim().min(1, "Option text is required").max(500),
  isCorrect: z.boolean(),
});

const baseQuestion = z.object({
  subjectId: idSchema("Select a subject"),
  topicId: idSchema().nullish(),
  text: z.string().trim().min(5, "Question text must be at least 5 characters").max(4000),
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  explanation: z.string().trim().max(4000).optional().or(z.literal("")),
  points: z.coerce.number().int().min(1, "Points must be at least 1").max(100),
  isActive: z.boolean().optional().default(true),
  options: z.array(optionSchema).min(2, "Add at least 2 options").max(8, "At most 8 options"),
});

/**
 * Correct-answer rules depend on the question type, so they're enforced with a refinement
 * rather than in the field schema. The same rules are re-checked on the server for every
 * write — the client form is a convenience, not the authority.
 *
 * Written against a partial shape so the identical check can guard both create and update
 * without widening either schema's inferred output.
 */
function answerRules(data: Partial<z.infer<typeof baseQuestion>>, ctx: z.RefinementCtx) {
  if (!data.options) return;

  const correct = data.options.filter((o) => o.isCorrect).length;

  if (correct === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["options"],
      message: "Mark at least one option as correct",
    });
    return;
  }

  if (data.type !== "MULTIPLE_CHOICE" && correct > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["options"],
      message: "This question type allows exactly one correct option",
    });
  }

  if (data.type === "TRUE_FALSE" && data.options.length !== 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["options"],
      message: "True/false questions must have exactly 2 options",
    });
  }

  const seen = new Set<string>();
  data.options.forEach((option, index) => {
    const key = option.text.trim().toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options", index, "text"],
        message: "Duplicate option text",
      });
    }
    seen.add(key);
  });
}

export const questionCreateSchema = baseQuestion.superRefine(answerRules);

/** Update accepts a partial patch, but if `options` is sent it must be a complete, valid set. */
export const questionUpdateSchema = baseQuestion.partial().superRefine(answerRules);

export type QuestionOptionInput = z.infer<typeof optionSchema>;
export type QuestionCreateInput = z.infer<typeof questionCreateSchema>;
export type QuestionUpdateInput = z.infer<typeof questionUpdateSchema>;
