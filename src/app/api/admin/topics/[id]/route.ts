import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/rbac";
import { conflict, notFound, readJson, validationError } from "@/lib/api";
import { topicUpdateSchema } from "@/server/validators/topic";
import { writeAudit } from "@/server/services/audit";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = topicUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const existing = await prisma.topic.findUnique({ where: { id: params.id } });
  if (!existing) return notFound("Topic");

  const { name, description } = parsed.data;

  try {
    const topic = await prisma.topic.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
      },
    });

    await writeAudit({
      userId: auth.user.id,
      action: "topic.update",
      entity: "Topic",
      entityId: topic.id,
      metadata: { changes: parsed.data },
    });

    return NextResponse.json({ topic });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return conflict("A topic with that name already exists in this subject.");
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const topic = await prisma.topic.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!topic) return notFound("Topic");

  // Questions survive: `Question.topicId` is onDelete: SetNull, so they become untagged.
  await prisma.topic.delete({ where: { id: params.id } });

  await writeAudit({
    userId: auth.user.id,
    action: "topic.delete",
    entity: "Topic",
    entityId: params.id,
    metadata: { name: topic.name },
  });

  return NextResponse.json({ ok: true });
}
