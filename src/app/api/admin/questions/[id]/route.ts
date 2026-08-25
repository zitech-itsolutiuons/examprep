import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, conflict, notFound, readJson, validationError } from "@/lib/api";
import { questionUpdateSchema } from "@/server/validators/question";
import {
  OptionInUseError,
  questionInclude,
  syncQuestionOptions,
  topicBelongsToSubject,
} from "@/server/services/questions";
import { writeAudit } from "@/server/services/audit";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const question = await prisma.question.findUnique({
    where: { id: params.id },
    include: questionInclude,
  });

  if (!question) return notFound("Question");
  return NextResponse.json({ question });
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = questionUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const existing = await prisma.question.findUnique({
    where: { id: params.id },
    select: { id: true, subjectId: true },
  });
  if (!existing) return notFound("Question");

  const { topicId, text, type, difficulty, explanation, points, isActive, options } = parsed.data;

  if (topicId && !(await topicBelongsToSubject(topicId, existing.subjectId))) {
    return badRequest("That topic does not belong to this question's subject.");
  }

  try {
    const question = await prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: params.id },
        data: {
          // subjectId is intentionally immutable — moving a question between subjects
          // would orphan it from the attempts that already scored it.
          ...(topicId !== undefined ? { topicId: topicId ?? null } : {}),
          ...(text !== undefined ? { text } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(difficulty !== undefined ? { difficulty } : {}),
          ...(explanation !== undefined ? { explanation: explanation || null } : {}),
          ...(points !== undefined ? { points } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });

      if (options) {
        await syncQuestionOptions(tx, params.id, options);
      }

      return tx.question.findUniqueOrThrow({
        where: { id: params.id },
        include: questionInclude,
      });
    });

    await writeAudit({
      userId: auth.user.id,
      action: "question.update",
      entity: "Question",
      entityId: question.id,
      metadata: { fields: Object.keys(parsed.data) },
    });

    return NextResponse.json({ question });
  } catch (err) {
    if (err instanceof OptionInUseError) return conflict(err.message);
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const question = await prisma.question.findUnique({
    where: { id: params.id },
    select: { id: true, subjectId: true, _count: { select: { userAnswers: true } } },
  });
  if (!question) return notFound("Question");

  // Deleting would cascade away the answers that make past results reviewable.
  if (question._count.userAnswers > 0) {
    return conflict(
      `This question has been answered in ${question._count.userAnswers} attempt(s). Deactivate it instead — it will stop appearing in new exams while past results stay intact.`
    );
  }

  await prisma.question.delete({ where: { id: params.id } });

  await writeAudit({
    userId: auth.user.id,
    action: "question.delete",
    entity: "Question",
    entityId: params.id,
    metadata: { subjectId: question.subjectId },
  });

  return NextResponse.json({ ok: true });
}
