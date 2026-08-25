import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/server/validators/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  // Public self-registration always creates a STUDENT — admins are provisioned
  // separately (seed script or by an existing admin), never through this route.
  const user = await prisma.user.create({
    data: { name, email: normalizedEmail, passwordHash, role: "STUDENT" },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "REGISTER", entity: "User", entityId: user.id },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
