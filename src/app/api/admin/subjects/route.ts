import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/rbac";
import { readJson, validationError } from "@/lib/api";
import { subjectCreateSchema } from "@/server/validators/subject";
import { uniqueSubjectSlug } from "@/server/services/subjects";
import { writeAudit } from "@/server/services/audit";

export async function GET() {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const subjects = await prisma.subject.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { questions: true, topics: true, attempts: true } },
    },
  });

  return NextResponse.json({ subjects });
}

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = subjectCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const { title, description, imageUrl, durationMin, passMark, isActive } = parsed.data;

  const subject = await prisma.subject.create({
    data: {
      title,
      slug: await uniqueSubjectSlug(title),
      description: description || null,
      imageUrl: imageUrl || null,
      durationMin,
      passMark,
      // A brand-new subject has no questions yet, so it can never start published.
      isPublished: false,
      isActive: isActive ?? true,
      createdById: auth.user.id,
    },
  });

  await writeAudit({
    userId: auth.user.id,
    action: "subject.create",
    entity: "Subject",
    entityId: subject.id,
    metadata: { title: subject.title, slug: subject.slug },
  });

  return NextResponse.json({ subject }, { status: 201 });
}
