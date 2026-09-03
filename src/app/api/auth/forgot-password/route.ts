import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { PasswordResetTokenModel, UserModel } from "@/models";
import { forgotPasswordSchema } from "@/server/validators/auth";
import { generateToken, hashToken } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/mail";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  await connectToDatabase();
  const user = await UserModel.findOne({ email }).lean();

  // Always return the same response whether or not the account exists —
  // otherwise this endpoint becomes a way to enumerate registered emails.
  if (user && user.isActive) {
    const rawToken = generateToken();
    await PasswordResetTokenModel.create({
      userId: String(user._id),
      token: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail(email, resetUrl);
  }

  return NextResponse.json({ success: true });
}
