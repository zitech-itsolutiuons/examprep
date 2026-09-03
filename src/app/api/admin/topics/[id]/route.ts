import { NextResponse } from "next/server";

import { connectToDatabase, isDuplicateKeyError } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { requireApiAdmin } from "@/lib/rbac";
import { conflict, notFound, readJson, validationError } from "@/lib/api";
import { TopicModel } from "@/models";
import { topicUpdateSchema } from "@/server/validators/topic";
import { deleteTopics } from "@/server/services/cascade";
import { writeAudit } from "@/server/services/audit";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = topicUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  await connectToDatabase();

  const existing = await TopicModel.findOne({ _id: params.id }).select("_id").lean();
  if (!existing) return notFound("Topic");

  const { name, description } = parsed.data;

  try {
    const updated = await TopicModel.findOneAndUpdate(
      { _id: params.id },
      {
        $set: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description: description || null } : {}),
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) return notFound("Topic");

    const topic = normalizeIds(updated) as unknown as { id: string };

    await writeAudit({
      userId: auth.user.id,
      action: "topic.update",
      entity: "Topic",
      entityId: topic.id,
      metadata: { changes: parsed.data },
    });

    return NextResponse.json({ topic });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return conflict("A topic with that name already exists in this subject.");
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  await connectToDatabase();

  const topic = await TopicModel.findOne({ _id: params.id }).select("name").lean();
  if (!topic) return notFound("Topic");

  // Questions survive: the cascade sets their `topicId` to null, which is what
  // `onDelete: SetNull` did — they become untagged rather than being deleted.
  await deleteTopics([params.id]);

  await writeAudit({
    userId: auth.user.id,
    action: "topic.delete",
    entity: "Topic",
    entityId: params.id,
    metadata: { name: topic.name },
  });

  return NextResponse.json({ ok: true });
}
