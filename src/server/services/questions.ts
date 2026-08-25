import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { QuestionOptionInput } from "@/server/validators/question";

/** Thrown when an option can't be removed because students already selected it. */
export class OptionInUseError extends Error {
  constructor(public count: number) {
    super(
      `Cannot remove an option that ${count} recorded answer(s) point to. Edit its text instead, or deactivate the question.`
    );
    this.name = "OptionInUseError";
  }
}

type Tx = Prisma.TransactionClient;

/**
 * Reconciles a question's options against the submitted set.
 *
 * Options carrying an `id` are updated in place; new ones are created; ones dropped from
 * the payload are deleted — but only when no `UserAnswer` references them, so historical
 * result reviews never lose the answer a student actually picked.
 */
export async function syncQuestionOptions(
  tx: Tx,
  questionId: string,
  options: QuestionOptionInput[]
) {
  const existing = await tx.questionOption.findMany({
    where: { questionId },
    select: { id: true },
  });

  const existingIds = new Set(existing.map((o) => o.id));
  const incomingIds = new Set(options.map((o) => o.id).filter((id): id is string => !!id));
  const removedIds = [...existingIds].filter((id) => !incomingIds.has(id));

  if (removedIds.length > 0) {
    const referenced = await tx.userAnswer.count({
      where: { selectedOptionId: { in: removedIds } },
    });
    if (referenced > 0) throw new OptionInUseError(referenced);

    await tx.questionOption.deleteMany({ where: { id: { in: removedIds } } });
  }

  // `order` follows the position in the submitted array so admins control display order.
  for (const [index, option] of options.entries()) {
    if (option.id && existingIds.has(option.id)) {
      await tx.questionOption.update({
        where: { id: option.id },
        data: { text: option.text, isCorrect: option.isCorrect, order: index },
      });
    } else {
      await tx.questionOption.create({
        data: {
          questionId,
          text: option.text,
          isCorrect: option.isCorrect,
          order: index,
        },
      });
    }
  }
}

/** Verifies a topic exists and belongs to the given subject. */
export async function topicBelongsToSubject(topicId: string, subjectId: string) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { subjectId: true },
  });
  return !!topic && topic.subjectId === subjectId;
}

/** Shape used by both admin question endpoints and the admin question list. */
export const questionInclude = {
  options: { orderBy: { order: "asc" } },
  topic: { select: { id: true, name: true } },
  _count: { select: { userAnswers: true } },
} satisfies Prisma.QuestionInclude;
