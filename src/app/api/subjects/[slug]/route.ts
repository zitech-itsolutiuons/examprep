import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { notFound } from "@/lib/api";
import { requireApiUser } from "@/lib/rbac";
import { ExamAttemptModel, QuestionModel, SubjectModel } from "@/models";
import { STUDENT_SUBJECT_FILTER } from "@/server/services/attempts";

type Params = { params: { slug: string } };

/** Subject detail for the student-facing pre-exam screen, plus this student's history. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  await connectToDatabase();

  const raw = await SubjectModel.findOne({ slug: params.slug, ...STUDENT_SUBJECT_FILTER })
    .select("slug title description imageUrl durationMin passMark")
    .populate({ path: "topics", select: "name", options: { sort: { name: 1 } } })
    .lean();

  if (!raw) return notFound("Subject");

  const subject = normalizeIds(raw) as unknown as Record<string, unknown> & { id: string };

  const [questionCount, attemptsRaw] = await Promise.all([
    QuestionModel.countDocuments({ subjectId: subject.id, isActive: true }),
    ExamAttemptModel.find({ userId: auth.user.id, subjectId: subject.id })
      .sort({ startedAt: -1 })
      .select("status attemptNumber percentage startedAt submittedAt")
      .lean(),
  ]);

  const attempts = (normalizeIds(attemptsRaw) as unknown as Array<Record<string, unknown>>).map(
    ({ _id, ...attempt }) => attempt
  );

  const { _id, ...rest } = subject;

  return NextResponse.json({
    subject: { ...rest, questionCount },
    attempts,
  });
}
