import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { UserModel } from "@/models";
import { requireApiAccount } from "@/lib/rbac";
import { notFound } from "@/lib/api";
import { updateProfileSchema } from "@/server/validators/auth";

export async function GET() {
  const auth = await requireApiAccount();
  if (auth.error) return auth.error;

  await connectToDatabase();

  const raw = await UserModel.findOne({ _id: auth.user.id })
    .select("name email role avatarUrl createdAt")
    .lean();

  const user = raw
    ? (({ _id, ...rest }) => rest)(
        normalizeIds(raw) as unknown as Record<string, unknown> & { id: string }
      )
    : null;

  return NextResponse.json({ user });
}

export async function PATCH(req: Request) {
  const auth = await requireApiAccount();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await connectToDatabase();

  const raw = await UserModel.findOneAndUpdate(
    { _id: auth.user.id },
    { $set: parsed.data },
    { new: true, runValidators: true }
  )
    .select("name email avatarUrl")
    .lean();

  if (!raw) return notFound("User");

  const { _id, ...user } = normalizeIds(raw) as unknown as Record<string, unknown> & {
    id: string;
  };

  return NextResponse.json({ user });
}
