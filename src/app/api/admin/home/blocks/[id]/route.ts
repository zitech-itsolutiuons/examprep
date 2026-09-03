import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { requireApiAdmin } from "@/lib/rbac";
import { notFound, readJson, validationError } from "@/lib/api";
import { HomeBlockModel } from "@/models";
import { refineHomeBlockUpdate } from "@/server/validators/home";
import { writeAudit } from "@/server/services/audit";
import type { HomeBlock } from "@/types/models";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  await connectToDatabase();

  // The stored kind decides which fields are required, so it is read before validating.
  const existing = await HomeBlockModel.findOne({ _id: params.id }).select("kind").lean();
  if (!existing) return notFound("Block");

  const parsed = refineHomeBlockUpdate(existing.kind).safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const updated = await HomeBlockModel.findOneAndUpdate(
    { _id: params.id },
    { $set: parsed.data },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) return notFound("Block");

  const block = normalizeIds(updated) as unknown as HomeBlock;

  await writeAudit({
    userId: auth.user.id,
    action: "home.block.update",
    entity: "HomeBlock",
    entityId: block.id,
    metadata: { kind: block.kind, fields: Object.keys(parsed.data) },
  });

  revalidatePath("/");

  return NextResponse.json({ block });
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  await connectToDatabase();

  const existing = await HomeBlockModel.findOne({ _id: params.id }).select("kind title").lean();
  if (!existing) return notFound("Block");

  // Landing-page copy is referenced by nothing, so unlike a subject or a question there is
  // no history to protect here — a delete is just a delete, and needs no cascade.
  await HomeBlockModel.deleteOne({ _id: params.id });

  await writeAudit({
    userId: auth.user.id,
    action: "home.block.delete",
    entity: "HomeBlock",
    entityId: params.id,
    metadata: { kind: existing.kind, title: existing.title },
  });

  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
