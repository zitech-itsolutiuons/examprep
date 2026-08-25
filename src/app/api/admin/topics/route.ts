import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/rbac";
import { conflict, notFound, readJson, validationError } from "@/lib/api";
import { topicCreateSchema } from "@/server/validators/topic";
import { writeAudit } from "@/server/services/audit";

export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const subjectId = new URL(req.url).searchParams.get("subjectId");

  const topics = await prisma.topic.findMany({
    where: subjectId ? { subjectId } : undefined,
    orderBy: [{ subject: { title: "asc" } }, { name: "asc" }],
    include: {
      subject: { select: { id: true, title: true } },
      _count: { select: { questions: true } },
    },
  });

  return NextResponse.json({ topics });
}

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = topicCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const { subjectId, name, description } = parsed.data;

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true },
  });
  if (!subject) return notFound("Subject");

  try {
    const topic = await prisma.topic.create({
      data: { subjectId, name, description: description || null },
    });

    await writeAudit({
      userId: auth.user.id,
      action: "topic.create",
      entity: "Topic",
      entityId: topic.id,
      metadata: { name: topic.name, subjectId },
    });

    return NextResponse.json({ topic }, { status: 201 });
  } catch (err) {
    // @@unique([subjectId, name])
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return conflict("A topic with that name already exists in this subject.");
    }
    throw err;
  }
}
