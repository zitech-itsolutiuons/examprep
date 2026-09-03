import { NextResponse } from "next/server";

import { connectToDatabase, mongoose } from "@/lib/mongoose";
import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, conflict, notFound, readJson, validationError } from "@/lib/api";
import { QuestionModel, UserAnswerModel } from "@/models";
import { questionUpdateSchema } from "@/server/validators/question";
import {
  OptionInUseError,
  loadAdminQuestion,
  syncQuestionOptions,
  topicBelongsToSubject,
} from "@/server/services/questions";
import { deleteQuestions } from "@/server/services/cascade";
import { writeAudit } from "@/server/services/audit";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const question = await loadAdminQuestion(params.id);

  if (!question) return notFound("Question");
  return NextResponse.json({ question });
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = questionUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  await connectToDatabase();

  const existing = await QuestionModel.findOne({ _id: params.id }).select("subjectId").lean();
  if (!existing) return notFound("Question");

  const { topicId, text, type, difficulty, explanation, points, isActive, options } = parsed.data;

  if (topicId && !(await topicBelongsToSubject(topicId, existing.subjectId))) {
    return badRequest("That topic does not belong to this question's subject.");
  }

  // The update and its option reconciliation must land together, exactly as Prisma's
  // `$transaction` did — a committed question with half-applied options would leave the
  // wrong answer key on a live question.
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await QuestionModel.updateOne(
        { _id: params.id },
        {
          $set: {
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
        },
        { session }
      );

      if (options) {
        await syncQuestionOptions(session, params.id, options);
      }
    });
  } catch (err) {
    if (err instanceof OptionInUseError) return conflict(err.message);
    throw err;
  } finally {
    await session.endSession();
  }

  await writeAudit({
    userId: auth.user.id,
    action: "question.update",
    entity: "Question",
    entityId: params.id,
    metadata: { fields: Object.keys(parsed.data) },
  });

  const question = await loadAdminQuestion(params.id);
  if (!question) return notFound("Question");

  return NextResponse.json({ question });
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  await connectToDatabase();

  const question = await QuestionModel.findOne({ _id: params.id }).select("subjectId").lean();
  if (!question) return notFound("Question");

  const answerCount = await UserAnswerModel.countDocuments({ questionId: params.id });

  // Deleting would cascade away the answers that make past results reviewable.
  if (answerCount > 0) {
    return conflict(
      `This question has been answered in ${answerCount} attempt(s). Deactivate it instead — it will stop appearing in new exams while past results stay intact.`
    );
  }

  // Mongo enforces no cascade of its own, so the options (and any stray flags) go through
  // the explicit cascade rather than a bare delete.
  await deleteQuestions([params.id]);

  await writeAudit({
    userId: auth.user.id,
    action: "question.delete",
    entity: "Question",
    entityId: params.id,
    metadata: { subjectId: question.subjectId },
  });

  return NextResponse.json({ ok: true });
}
