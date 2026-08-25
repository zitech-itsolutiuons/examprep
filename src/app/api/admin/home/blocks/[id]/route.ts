import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/rbac";
import { notFound, readJson, validationError } from "@/lib/api";
import { refineHomeBlockUpdate } from "@/server/validators/home";
import { writeAudit } from "@/server/services/audit";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  // The stored kind decides which fields are required, so it is read before validating.
  const existing = await prisma.homeBlock.findUnique({
    where: { id: params.id },
    select: { id: true, kind: true },
  });
  if (!existing) return notFound("Block");

  const parsed = refineHomeBlockUpdate(existing.kind).safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const block = await prisma.homeBlock.update({
    where: { id: existing.id },
    data: parsed.data,
  });

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

  const existing = await prisma.homeBlock.findUnique({
    where: { id: params.id },
    select: { id: true, kind: true, title: true },
  });
  if (!existing) return notFound("Block");

  // Landing-page copy is referenced by nothing, so unlike a subject or a question there is
  // no history to protect here — a delete is just a delete.
  await prisma.homeBlock.delete({ where: { id: existing.id } });

  await writeAudit({
    userId: auth.user.id,
    action: "home.block.delete",
    entity: "HomeBlock",
    entityId: existing.id,
    metadata: { kind: existing.kind, title: existing.title },
  });

  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
