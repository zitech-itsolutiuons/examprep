import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/rbac";

const PAGE_SIZE = 25;

export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const search = params.get("q")?.trim();
  const role = params.get("role");
  const status = params.get("status");
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const where: Prisma.UserWhereInput = {
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    // Guest rows are sessions, not accounts — excluded here for the same reason as on the
    // users page. A `role` filter still narrows within the real accounts.
    role: role === "ADMIN" || role === "STUDENT" ? role : { not: "GUEST" },
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
  };

  const [users, total] = await Promise.all([
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
  ]);

  return NextResponse.json({
    users,
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}
