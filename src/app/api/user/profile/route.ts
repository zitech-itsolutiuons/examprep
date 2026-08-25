import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAccount } from "@/lib/rbac";
import { updateProfileSchema } from "@/server/validators/auth";

export async function GET() {
  const auth = await requireApiAccount();
  if (auth.error) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true, createdAt: true },
  });

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

  const user = await prisma.user.update({
    where: { id: auth.user.id },
    data: parsed.data,
    select: { id: true, name: true, email: true, avatarUrl: true },
  });

  return NextResponse.json({ user });
}
