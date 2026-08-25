import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api";
import { requireApiUser } from "@/lib/rbac";
import { STUDENT_SUBJECT_FILTER } from "@/server/services/attempts";

type Params = { params: { slug: string } };

/** Subject detail for the student-facing pre-exam screen, plus this student's history. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const subject = await prisma.subject.findFirst({
    where: { slug: params.slug, ...STUDENT_SUBJECT_FILTER },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      imageUrl: true,
      durationMin: true,
      passMark: true,
      topics: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      _count: { select: { questions: { where: { isActive: true } } } },
    },
  });

  if (!subject) return notFound("Subject");

  const attempts = await prisma.examAttempt.findMany({
    where: { userId: auth.user.id, subjectId: subject.id },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      attemptNumber: true,
      percentage: true,
      startedAt: true,
      submittedAt: true,
    },
  });

  const { _count, ...rest } = subject;

  return NextResponse.json({
    subject: { ...rest, questionCount: _count.questions },
    attempts,
  });
}
