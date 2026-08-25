import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, notFound, readJson, validationError } from "@/lib/api";
import { questionCreateSchema } from "@/server/validators/question";
import { questionInclude, topicBelongsToSubject } from "@/server/services/questions";
import { writeAudit } from "@/server/services/audit";

export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const subjectId = params.get("subjectId");
  const topicId = params.get("topicId");
  const search = params.get("q")?.trim();

  if (!subjectId) return badRequest("subjectId is required");

  const questions = await prisma.question.findMany({
    where: {
      subjectId,
      ...(topicId ? { topicId } : {}),
      ...(search ? { text: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: questionInclude,
  });

  return NextResponse.json({ questions });
}

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = questionCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const { subjectId, topicId, text, type, difficulty, explanation, points, isActive, options } =
    parsed.data;

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });
  if (!subject) return notFound("Subject");

  if (topicId && !(await topicBelongsToSubject(topicId, subjectId))) {
    return badRequest("That topic does not belong to the selected subject.");
  }

  const question = await prisma.question.create({
    data: {
      subjectId,
      topicId: topicId ?? null,
      text,
      type,
      difficulty,
      explanation: explanation || null,
      points,
      isActive: isActive ?? true,
      createdById: auth.user.id,
      options: {
        create: options.map((option, index) => ({
          text: option.text,
          isCorrect: option.isCorrect,
          order: index,
        })),
      },
    },
    include: questionInclude,
  });

  await writeAudit({
    userId: auth.user.id,
    action: "question.create",
    entity: "Question",
    entityId: question.id,
    metadata: { subjectId, type, optionCount: options.length },
  });

  return NextResponse.json({ question }, { status: 201 });
}
