import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { ExamAttemptModel, UserModel } from "@/models";
import { requireAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { UsersTable, type UserRow } from "@/components/admin/users-table";
import { countByParent } from "@/server/services/counts";
import { ShieldCheck, UserRound, Users } from "lucide-react";
import type { Role } from "@/types/models";

export const metadata = { title: "Users" };

const PAGE_SIZE = 25;

type SearchParams = {
  searchParams: { q?: string; role?: string; status?: string; page?: string };
};

/** Escapes regex metacharacters so a search term is matched literally. */
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default async function AdminUsersPage({ searchParams }: SearchParams) {
  const admin = await requireAdmin();

  const search = searchParams.q?.trim() ?? "";
  const role = searchParams.role === "ADMIN" || searchParams.role === "STUDENT" ? searchParams.role : "";
  const status =
    searchParams.status === "active" || searchParams.status === "inactive" ? searchParams.status : "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  // Prisma's `contains` with `mode: "insensitive"` becomes an escaped case-insensitive
  // regex, `OR` becomes `$or`, and `{ not: "GUEST" }` becomes `$ne`.
  const filter: Record<string, unknown> = {
    ...(search
      ? {
          $or: [
            { name: { $regex: escapeRegex(search), $options: "i" } },
            { email: { $regex: escapeRegex(search), $options: "i" } },
          ],
        }
      : {}),
    // Guests are code-based sessions, not accounts: they have no password, no email anyone
    // can reach, and nothing on this screen applies to them. Their attempts are browsable
    // under /admin/attempts, and /admin/access reports how many exist.
    role: role ? role : { $ne: "GUEST" },
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
  };

  await connectToDatabase();

  const [raw, total, totalUsers, adminCount, activeCount] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .select("name email role isActive createdAt")
      .lean(),
    UserModel.countDocuments(filter),
    UserModel.countDocuments({ role: { $ne: "GUEST" } }),
    UserModel.countDocuments({ role: "ADMIN" }),
    UserModel.countDocuments({ isActive: true, role: { $ne: "GUEST" } }),
  ]);

  const users = normalizeIds(raw) as unknown as Array<{
    id: string;
    name: string;
    email: string;
    role: Role;
    isActive: boolean;
    createdAt: Date;
  }>;

  const attemptCounts = await countByParent(
    ExamAttemptModel,
    "userId",
    users.map((user) => user.id)
  );

  const rows: UserRow[] = users.flatMap((user) =>
    // The query already excludes guests; this narrows `Role` to the two the table renders.
    user.role === "GUEST"
      ? []
      : [
          {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            createdAt: user.createdAt.toISOString(),
            attemptCount: attemptCounts.get(user.id) ?? 0,
          },
        ]
  );

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage roles and account access. Deactivating an account keeps its past results."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total users" value={totalUsers} icon={Users} />
        <StatCard
          label="Students"
          value={totalUsers - adminCount}
          hint={`${adminCount} admin${adminCount === 1 ? "" : "s"}`}
          icon={UserRound}
        />
        <StatCard
          label="Active accounts"
          value={activeCount}
          hint={`${totalUsers - activeCount} deactivated`}
          icon={ShieldCheck}
        />
      </div>

      <UsersTable
        users={rows}
        currentUserId={admin.id}
        filters={{ q: search, role, status }}
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
      />
    </div>
  );
}
