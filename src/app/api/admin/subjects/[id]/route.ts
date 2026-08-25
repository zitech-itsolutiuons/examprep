import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, conflict, notFound, readJson, validationError } from "@/lib/api";
import { subjectUpdateSchema } from "@/server/validators/subject";
import { activeQuestionCount } from "@/server/services/subjects";
import { writeAudit } from "@/server/services/audit";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const subject = await prisma.subject.findUnique({
    where: { id: params.id },
    include: {
      topics: { orderBy: { name: "asc" }, include: { _count: { select: { questions: true } } } },
      _count: { select: { questions: true, attempts: true } },
    },
  });

  if (!subject) return notFound("Subject");
  return NextResponse.json({ subject });
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = subjectUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const existing = await prisma.subject.findUnique({ where: { id: params.id } });
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

  const subject = await prisma.subject.update({
    where: { id: params.id },
    data: {
      // The slug stays fixed after creation so existing student links keep resolving.
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl || null } : {}),
      ...(durationMin !== undefined ? { durationMin } : {}),
      ...(passMark !== undefined ? { passMark } : {}),
      ...(isPublished !== undefined ? { isPublished } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });

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

  const subject = await prisma.subject.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, _count: { select: { attempts: true } } },
  });
  if (!subject) return notFound("Subject");

  // Attempts are permanent student records — deactivate instead of destroying history.
  if (subject._count.attempts > 0) {
    return conflict(
      `This subject has ${subject._count.attempts} recorded attempt(s). Deactivate it instead of deleting, so student results are preserved.`
    );
  }

  await prisma.subject.delete({ where: { id: params.id } });

  await writeAudit({
    userId: auth.user.id,
    action: "subject.delete",
    entity: "Subject",
    entityId: params.id,
    metadata: { title: subject.title },
  });

  return NextResponse.json({ ok: true });
}
