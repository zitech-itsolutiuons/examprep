import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireApiAdmin } from "@/lib/rbac";
import { readJson, validationError } from "@/lib/api";
import { createHomeBlock, reorderHomeBlocks } from "@/server/services/home";
import { homeBlockCreateSchema, homeBlockReorderSchema } from "@/server/validators/home";
import { writeAudit } from "@/server/services/audit";

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = homeBlockCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const block = await createHomeBlock(parsed.data);

  await writeAudit({
    userId: auth.user.id,
    action: "home.block.create",
    entity: "HomeBlock",
    entityId: block.id,
    metadata: { kind: block.kind, title: block.title },
  });

  revalidatePath("/");

  return NextResponse.json({ block }, { status: 201 });
}

/** Reorders one section's blocks. Ordering is a property of the list, not of a single row. */
export async function PATCH(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = homeBlockReorderSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const { kind, ids } = parsed.data;
  await reorderHomeBlocks(kind, ids);

  await writeAudit({
    userId: auth.user.id,
    action: "home.block.reorder",
    entity: "HomeBlock",
    metadata: { kind, ids },
  });

  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
