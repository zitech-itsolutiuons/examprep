import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/rbac";
import { STUDENT_SUBJECT_FILTER } from "@/server/services/attempts";

/**
 * Student-facing subject list. Unpublished and inactive subjects are filtered out in
 * the query, so a student never learns they exist.
 */
export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const subjects = await prisma.subject.findMany({
    where: STUDENT_SUBJECT_FILTER,
    orderBy: { title: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      imageUrl: true,
      durationMin: true,
      passMark: true,
      _count: { select: { questions: { where: { isActive: true } } } },
    },
  });

  return NextResponse.json({
    subjects: subjects.map(({ _count, ...subject }) => ({
      ...subject,
      questionCount: _count.questions,
    })),
  });
}
