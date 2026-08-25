import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAccount } from "@/lib/rbac";
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

  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ success: true });
}
