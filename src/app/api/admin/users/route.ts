import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { requireApiAdmin } from "@/lib/rbac";
import { ExamAttemptModel, UserModel } from "@/models";
import { attachCounts, countByParent } from "@/server/services/counts";

const PAGE_SIZE = 25;

/** Escapes regex metacharacters so a search term is matched literally. */
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const search = params.get("q")?.trim();
  const role = params.get("role");
  const status = params.get("status");
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  // Prisma's `contains` with `mode: "insensitive"` becomes an escaped case-insensitive
  // regex; `OR` becomes `$or`, and `{ not: "GUEST" }` becomes `$ne`.
  const filter: Record<string, unknown> = {
    ...(search
      ? {
          $or: [
            { name: { $regex: escapeRegex(search), $options: "i" } },
            { email: { $regex: escapeRegex(search), $options: "i" } },
          ],
        }
      : {}),
    // Guest rows are sessions, not accounts — excluded here for the same reason as on the
    // users page. A `role` filter still narrows within the real accounts.
    role: role === "ADMIN" || role === "STUDENT" ? role : { $ne: "GUEST" },
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
  };

  await connectToDatabase();

  const [raw, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .select("name email role isActive createdAt")
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  const rows = normalizeIds(raw) as unknown as Array<Record<string, unknown> & { id: string }>;

  const attemptCounts = await countByParent(
    ExamAttemptModel,
    "userId",
    rows.map((user) => user.id)
  );

  const users = attachCounts(rows, { attempts: attemptCounts }).map(({ _id, ...user }) => user);

  return NextResponse.json({
    users,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}
