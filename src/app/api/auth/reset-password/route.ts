import { NextResponse } from "next/server";
import { connectToDatabase, mongoose } from "@/lib/mongoose";
import { PasswordResetTokenModel, UserModel } from "@/models";
import { resetPasswordSchema } from "@/server/validators/auth";
import { hashToken } from "@/lib/tokens";
import { hashPassword } from "@/lib/password";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await connectToDatabase();

  const tokenHash = hashToken(parsed.data.token);
  const resetToken = await PasswordResetTokenModel.findOne({ token: tokenHash }).lean();

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  // Both writes or neither: a new password that leaves the token unspent would let the
  // same reset link be replayed.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await UserModel.updateOne(
        { _id: resetToken.userId },
        { $set: { passwordHash } },
        { session }
      );
      await PasswordResetTokenModel.updateOne(
        { _id: resetToken._id },
        { $set: { usedAt: new Date() } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return NextResponse.json({ success: true });
}
