import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, notFound, readJson, validationError } from "@/lib/api";
import { adminUserUpdateSchema } from "@/server/validators/user";
import { writeAudit } from "@/server/services/audit";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = adminUserUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  // An admin editing their own row could lock themselves — and possibly everyone — out.
  if (params.id === auth.user.id) {
    return badRequest("You can't change your own role or deactivate your own account.");
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, isActive: true },
  });
  if (!user) return notFound("User");

  const { role, isActive } = parsed.data;

  // Never leave the platform without an active admin.
  const losingAdmin =
    (role === "STUDENT" && user.role === "ADMIN") ||
    (isActive === false && user.role === "ADMIN" && role !== "ADMIN");

  if (losingAdmin) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: user.id } },
    });
    if (otherActiveAdmins === 0) {
      return badRequest("This is the last active admin — promote another admin first.");
    }
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  await writeAudit({
    userId: auth.user.id,
    action: "user.update",
    entity: "User",
    entityId: updated.id,
    metadata: { role, isActive },
  });

  return NextResponse.json({ user: updated });
}
