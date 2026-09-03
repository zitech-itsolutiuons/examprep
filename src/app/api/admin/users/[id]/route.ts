import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, notFound, readJson, validationError } from "@/lib/api";
import { UserModel } from "@/models";
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

  await connectToDatabase();

  const user = await UserModel.findOne({ _id: params.id }).select("role isActive").lean();
  if (!user) return notFound("User");

  const { role, isActive } = parsed.data;

  // Never leave the platform without an active admin.
  const losingAdmin =
    (role === "STUDENT" && user.role === "ADMIN") ||
    (isActive === false && user.role === "ADMIN" && role !== "ADMIN");

  if (losingAdmin) {
    const otherActiveAdmins = await UserModel.countDocuments({
      role: "ADMIN",
      isActive: true,
      _id: { $ne: params.id },
    });
    if (otherActiveAdmins === 0) {
      return badRequest("This is the last active admin — promote another admin first.");
    }
  }

  const raw = await UserModel.findOneAndUpdate(
    { _id: params.id },
    {
      $set: {
        ...(role !== undefined ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    },
    { new: true }
  )
    .select("name email role isActive createdAt")
    .lean();

  if (!raw) return notFound("User");

  const { _id, ...updated } = normalizeIds(raw) as unknown as Record<string, unknown> & {
    id: string;
  };

  await writeAudit({
    userId: auth.user.id,
    action: "user.update",
    entity: "User",
    entityId: updated.id as string,
    metadata: { role, isActive },
  });

  return NextResponse.json({ user: updated });
}
