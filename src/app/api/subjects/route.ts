import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { requireApiUser } from "@/lib/rbac";
import { QuestionModel, SubjectModel } from "@/models";
import { STUDENT_SUBJECT_FILTER } from "@/server/services/attempts";
import { countByParent } from "@/server/services/counts";

/**
 * Student-facing subject list. Unpublished and inactive subjects are filtered out in
 * the query, so a student never learns they exist.
 */
export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  await connectToDatabase();

  const raw = await SubjectModel.find(STUDENT_SUBJECT_FILTER)
    .sort({ title: 1 })
    .select("slug title description imageUrl durationMin passMark")
    .lean();

  const subjects = normalizeIds(raw) as unknown as Array<
    Record<string, unknown> & { id: string }
  >;

  // Was `_count: { questions: { where: { isActive: true } } }` — one grouped count for the
  // whole page rather than a subquery per subject.
  const questionCounts = await countByParent(
    QuestionModel,
    "subjectId",
    subjects.map((s) => s.id),
    { isActive: true }
  );

  return NextResponse.json({
    subjects: subjects.map(({ _id, ...subject }) => ({
      ...subject,
      questionCount: questionCounts.get(subject.id as string) ?? 0,
    })),
  });
}
