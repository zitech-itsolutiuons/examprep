import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongoose";
import { UserModel } from "@/models";
import { requireApiAccount } from "@/lib/rbac";
import { notFound } from "@/lib/api";
import { changePasswordSchema } from "@/server/validators/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function POST(req: Request) {
  const auth = await requireApiAccount();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await connectToDatabase();

  // Was `findUniqueOrThrow`, which produced a 500 on a stale session. The document is only
  // missing when the account was deleted mid-session, so 404 is the honest answer.
  const user = await UserModel.findOne({ _id: auth.user.id }).select("passwordHash").lean();
  if (!user) return notFound("User");

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await UserModel.updateOne({ _id: auth.user.id }, { $set: { passwordHash } });

  return NextResponse.json({ success: true });
}
