import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { UsersTable, type UserRow } from "@/components/admin/users-table";
import { ShieldCheck, UserRound, Users } from "lucide-react";

export const metadata = { title: "Users" };

const PAGE_SIZE = 25;

type SearchParams = {
  searchParams: { q?: string; role?: string; status?: string; page?: string };
};

export default async function AdminUsersPage({ searchParams }: SearchParams) {
  const admin = await requireAdmin();

  const search = searchParams.q?.trim() ?? "";
  const role = searchParams.role === "ADMIN" || searchParams.role === "STUDENT" ? searchParams.role : "";
  const status =
    searchParams.status === "active" || searchParams.status === "inactive" ? searchParams.status : "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const where: Prisma.UserWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    // Guests are code-based sessions, not accounts: they have no password, no email anyone
    // can reach, and nothing on this screen applies to them. Their attempts are browsable
    // under /admin/attempts, and /admin/access reports how many exist.
    role: role ? role : { not: "GUEST" },
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
  };

  const [users, total, totalUsers, adminCount, activeCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { attempts: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { role: { not: "GUEST" } } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { isActive: true, role: { not: "GUEST" } } }),
  ]);

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
            attemptCount: user._count.attempts,
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
