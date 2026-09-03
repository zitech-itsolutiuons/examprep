import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongoose";
import { serialize } from "@/lib/serialize";
import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, notFound, readJson, validationError } from "@/lib/api";
import { QuestionModel, QuestionOptionModel, SubjectModel } from "@/models";
import { questionCreateSchema } from "@/server/validators/question";
import {
  loadAdminQuestion,
  loadAdminQuestions,
  topicBelongsToSubject,
} from "@/server/services/questions";
import { writeAudit } from "@/server/services/audit";

export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const subjectId = params.get("subjectId");
  const topicId = params.get("topicId");
  const search = params.get("q")?.trim();

  if (!subjectId) return badRequest("subjectId is required");

  const questions = await loadAdminQuestions({ subjectId, topicId, search });

  return NextResponse.json({ questions });
}

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = questionCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const { subjectId, topicId, text, type, difficulty, explanation, points, isActive, options } =
    parsed.data;

  await connectToDatabase();

  const subject = await SubjectModel.findOne({ _id: subjectId }).select("_id").lean();
  if (!subject) return notFound("Subject");

  if (topicId && !(await topicBelongsToSubject(topicId, subjectId))) {
    return badRequest("That topic does not belong to the selected subject.");
  }

  const created = await QuestionModel.create({
    subjectId,
    topicId: topicId ?? null,
    text,
    type,
    difficulty,
    explanation: explanation || null,
    points,
    isActive: isActive ?? true,
    createdById: auth.user.id,
  });

  // Was Prisma's nested `options: { create: [...] }`. The options are a separate collection
  // now, so they are inserted explicitly — and `order` follows the submitted array so the
  // admin controls display order.
  await QuestionOptionModel.insertMany(
    options.map((option, index) => ({
      questionId: String(created._id),
      text: option.text,
      isCorrect: option.isCorrect,
      order: index,
    }))
  );

  await writeAudit({
    userId: auth.user.id,
    action: "question.create",
    entity: "Question",
    entityId: String(created._id),
    metadata: { subjectId, type, optionCount: options.length },
  });

  const question = await loadAdminQuestion(String(created._id));

  return NextResponse.json({ question: question ?? serialize(created) }, { status: 201 });
}
