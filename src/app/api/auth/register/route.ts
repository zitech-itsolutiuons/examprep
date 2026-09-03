import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { hashPassword } from "@/lib/password";
import { AuditLogModel, UserModel } from "@/models";
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

  await connectToDatabase();

  const existing = await UserModel.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  // Public self-registration always creates a STUDENT — admins are provisioned
  // separately (seed script or by an existing admin), never through this route.
  let user;
  try {
    user = await UserModel.create({
      name,
      email: normalizedEmail,
      passwordHash,
      role: "STUDENT",
    });
  } catch (error) {
    // The check above is not a lock: two simultaneous signups with the same address both
    // pass it and one loses on the unique index. 11000 is Mongo's duplicate-key code —
    // reported as the same 409 rather than a 500, since the outcome is identical.
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }
    throw error;
  }

  await AuditLogModel.create({
    userId: String(user._id),
    action: "REGISTER",
    entity: "User",
    entityId: String(user._id),
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
