import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, conflict, notFound, readJson, validationError } from "@/lib/api";
import { ExamAttemptModel, QuestionModel, SubjectModel } from "@/models";
import { subjectUpdateSchema } from "@/server/validators/subject";
import { activeQuestionCount } from "@/server/services/subjects";
import { attachCount, attachCounts, countByParent } from "@/server/services/counts";
import { deleteSubjects } from "@/server/services/cascade";
import { writeAudit } from "@/server/services/audit";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  await connectToDatabase();

  const raw = await SubjectModel.findOne({ _id: params.id })
    .populate({ path: "topics", options: { sort: { name: 1 } } })
    .lean();

  if (!raw) return notFound("Subject");

  const row = normalizeIds(raw) as unknown as Record<string, unknown> & {
    id: string;
    topics: Array<Record<string, unknown> & { id: string }>;
  };

  const [questions, attempts, topicQuestions] = await Promise.all([
    countByParent(QuestionModel, "subjectId", [row.id]),
    countByParent(ExamAttemptModel, "subjectId", [row.id]),
    // Per-topic question totals — was the nested `_count` inside `topics`.
    countByParent(
      QuestionModel,
      "topicId",
      (row.topics ?? []).map((topic) => topic.id)
    ),
  ]);

  const subject = {
    ...attachCount(row, { questions, attempts }),
    topics: attachCounts(row.topics ?? [], { questions: topicQuestions }),
  };

  return NextResponse.json({ subject });
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = subjectUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  await connectToDatabase();

  const existing = await SubjectModel.findOne({ _id: params.id }).select("isPublished").lean();
  if (!existing) return notFound("Subject");

  const { title, description, imageUrl, durationMin, passMark, isPublished, isActive } =
    parsed.data;

  // Publishing an empty subject would show students an exam they cannot take.
  if (isPublished === true && !existing.isPublished) {
    const questions = await activeQuestionCount(params.id);
    if (questions === 0) {
      return badRequest("Add at least one active question before publishing this subject.");
    }
  }

  const updated = await SubjectModel.findOneAndUpdate(
    { _id: params.id },
    {
      $set: {
        // The slug stays fixed after creation so existing student links keep resolving.
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(imageUrl !== undefined ? { imageUrl: imageUrl || null } : {}),
        ...(durationMin !== undefined ? { durationMin } : {}),
        ...(passMark !== undefined ? { passMark } : {}),
        ...(isPublished !== undefined ? { isPublished } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    },
    { new: true }
  ).lean();

  if (!updated) return notFound("Subject");

  const subject = normalizeIds(updated) as unknown as { id: string };

  await writeAudit({
    userId: auth.user.id,
    action: "subject.update",
    entity: "Subject",
    entityId: subject.id,
    metadata: { changes: parsed.data },
  });

  return NextResponse.json({ subject });
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  await connectToDatabase();

  const subject = await SubjectModel.findOne({ _id: params.id }).select("title").lean();
  if (!subject) return notFound("Subject");

  const attemptCount = await ExamAttemptModel.countDocuments({ subjectId: params.id });

  // Attempts are permanent student records — deactivate instead of destroying history.
  if (attemptCount > 0) {
    return conflict(
      `This subject has ${attemptCount} recorded attempt(s). Deactivate it instead of deleting, so student results are preserved.`
    );
  }

  // Topics and questions (with their options) have no database-level cascade behind them
  // any more, so the delete goes through the explicit one.
  await deleteSubjects([params.id]);

  await writeAudit({
    userId: auth.user.id,
    action: "subject.delete",
    entity: "Subject",
    entityId: params.id,
    metadata: { title: subject.title },
  });

  return NextResponse.json({ ok: true });
}
