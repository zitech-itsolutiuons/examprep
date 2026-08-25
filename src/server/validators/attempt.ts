import { z } from "zod";

export const startAttemptSchema = z.object({
  subjectId: z.string().cuid("Choose a subject to start"),
});

/**
 * Autosave payload. The client always sends the *complete* selection for one question,
 * never a delta, so a dropped or out-of-order request can't leave a half-applied answer.
 * An empty array clears the answer (used by "Clear selection" and by skipping).
 */
export const saveAnswerSchema = z.object({
  questionId: z.string().cuid(),
  selectedOptionIds: z.array(z.string().cuid()).max(8),
  isSkipped: z.boolean().optional().default(false),
});

export const flagQuestionSchema = z.object({
  questionId: z.string().cuid(),
  flagged: z.boolean(),
});

export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type FlagQuestionInput = z.infer<typeof flagQuestionSchema>;
