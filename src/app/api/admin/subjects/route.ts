import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds, serialize } from "@/lib/serialize";
import { requireApiAdmin } from "@/lib/rbac";
import { readJson, validationError } from "@/lib/api";
import { ExamAttemptModel, QuestionModel, SubjectModel, TopicModel } from "@/models";
import { subjectCreateSchema } from "@/server/validators/subject";
import { uniqueSubjectSlug } from "@/server/services/subjects";
import { attachCounts, countByParent } from "@/server/services/counts";
import { writeAudit } from "@/server/services/audit";

export async function GET() {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  await connectToDatabase();

  const raw = await SubjectModel.find()
    .sort({ createdAt: -1 })
    .populate({ path: "createdBy", select: "name" })
    .lean();

  const rows = normalizeIds(raw) as unknown as Array<Record<string, unknown> & { id: string }>;
  const ids = rows.map((subject) => subject.id);

  // Was `_count: { select: { questions, topics, attempts } }` — three grouped counts for
  // the whole page instead of a correlated subquery per subject.
  const [questions, topics, attempts] = await Promise.all([
    countByParent(QuestionModel, "subjectId", ids),
    countByParent(TopicModel, "subjectId", ids),
    countByParent(ExamAttemptModel, "subjectId", ids),
  ]);

  const subjects = attachCounts(rows, { questions, topics, attempts });

  return NextResponse.json({ subjects });
}

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = subjectCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const { title, description, imageUrl, durationMin, passMark, isActive } = parsed.data;

  await connectToDatabase();

  const created = await SubjectModel.create({
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
  });

  const subject = serialize<{ id: string; title: string; slug: string }>(created);

  await writeAudit({
    userId: auth.user.id,
    action: "subject.create",
    entity: "Subject",
    entityId: subject.id,
    metadata: { title: subject.title, slug: subject.slug },
  });

  return NextResponse.json({ subject }, { status: 201 });
}
