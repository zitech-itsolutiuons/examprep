import { z } from "zod";

import { id } from "@/server/validators/id";

export const topicCreateSchema = z.object({
  subjectId: id("Select a subject"),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

export const topicUpdateSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100).optional(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});

export type TopicCreateInput = z.infer<typeof topicCreateSchema>;
export type TopicUpdateInput = z.infer<typeof topicUpdateSchema>;
