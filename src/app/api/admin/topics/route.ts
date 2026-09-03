import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds, serialize } from "@/lib/serialize";
import { requireApiAdmin } from "@/lib/rbac";
import { conflict, notFound, readJson, validationError } from "@/lib/api";
import { QuestionModel, SubjectModel, TopicModel } from "@/models";
import { topicCreateSchema } from "@/server/validators/topic";
import { attachCounts, countByParent } from "@/server/services/counts";
import { isDuplicateKeyError } from "@/lib/mongoose";
import { writeAudit } from "@/server/services/audit";

export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const subjectId = new URL(req.url).searchParams.get("subjectId");

  await connectToDatabase();

  const raw = await TopicModel.find(subjectId ? { subjectId } : {})
    .sort({ name: 1 })
    .populate({ path: "subject", select: "title" })
    .lean();

  const rows = normalizeIds(raw) as unknown as Array<
    Record<string, unknown> & { id: string; subject?: { title?: string } | null }
  >;

  // Prisma ordered by the joined `subject.title` then `name`. Mongo cannot sort on a
  // populated field, so the subject-level ordering is applied here; `name` is already
  // sorted by the query, and the comparison below is stable so it survives.
  rows.sort((a, b) => (a.subject?.title ?? "").localeCompare(b.subject?.title ?? ""));

  const questionCounts = await countByParent(
    QuestionModel,
    "topicId",
    rows.map((topic) => topic.id)
  );

  const topics = attachCounts(rows, { questions: questionCounts });

  return NextResponse.json({ topics });
}

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = topicCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const { subjectId, name, description } = parsed.data;

  await connectToDatabase();

  const subject = await SubjectModel.findOne({ _id: subjectId }).select("_id").lean();
  if (!subject) return notFound("Subject");

  try {
    const created = await TopicModel.create({
      subjectId,
      name,
      description: description || null,
    });

    const topic = serialize<{ id: string; name: string }>(created);

    await writeAudit({
      userId: auth.user.id,
      action: "topic.create",
      entity: "Topic",
      entityId: topic.id,
      metadata: { name: topic.name, subjectId },
    });

    return NextResponse.json({ topic }, { status: 201 });
  } catch (err) {
    // The unique compound index on { subjectId, name }. Was Prisma's P2002.
    if (isDuplicateKeyError(err)) {
      return conflict("A topic with that name already exists in this subject.");
    }
    throw err;
  }
}
