import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ClipboardList } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttemptsFilters } from "@/components/admin/attempts-filters";

export const metadata = { title: "Attempts" };

const PAGE_SIZE = 30;

type SearchParams = {
  searchParams: {
    subjectId?: string;
    status?: string;
    userId?: string;
    who?: string;
    page?: string;
  };
};

const STATUS_VARIANT = {
  SUBMITTED: "success",
  IN_PROGRESS: "warning",
  ABANDONED: "secondary",
} as const;

const STATUS_LABEL = {
  SUBMITTED: "Submitted",
  IN_PROGRESS: "In progress",
  ABANDONED: "Abandoned",
} as const;

function formatDateTime(value: Date) {
  return value.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

export default async function AdminAttemptsPage({ searchParams }: SearchParams) {
  await requireAdmin();

  const status =
    searchParams.status === "SUBMITTED" ||
    searchParams.status === "IN_PROGRESS" ||
    searchParams.status === "ABANDONED"
      ? searchParams.status
      : "";
  const subjectId = searchParams.subjectId ?? "";
  const userId = searchParams.userId ?? "";
  const who = searchParams.who === "guests" || searchParams.who === "accounts" ? searchParams.who : "";
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const where: Prisma.ExamAttemptWhereInput = {
    ...(status ? { status } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(userId ? { userId } : {}),
    // Guest attempts are listed here by default — this is the one screen where they belong,
    // since it is a record of what happened rather than a performance statistic.
    ...(who === "guests" ? { user: { role: "GUEST" } } : {}),
    ...(who === "accounts" ? { user: { role: { not: "GUEST" } } } : {}),
  };

  const [attempts, total, subjects, scopedUser] = await Promise.all([
    prisma.examAttempt.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        subject: { select: { id: true, title: true, passMark: true } },
      },
    }),
    prisma.examAttempt.count({ where }),
    prisma.subject.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
    userId
      ? prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
      : Promise.resolve(null),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (subjectId) params.set("subjectId", subjectId);
    if (status) params.set("status", status);
    if (userId) params.set("userId", userId);
    if (who) params.set("who", who);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/admin/attempts?${qs}` : "/admin/attempts";
  }

  return (
    <div>
      <PageHeader
        title="Exam attempts"
        description={
          scopedUser
            ? `Attempts by ${scopedUser.name ?? scopedUser.email}.`
            : "Every attempt across the platform, newest first."
        }
      />

      <AttemptsFilters
        subjects={subjects}
        filters={{ subjectId, status, userId, who }}
        userLabel={scopedUser?.name ?? scopedUser?.email ?? null}
      />

      {attempts.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No attempts to show"
          description={
            total === 0 && !subjectId && !status && !userId && !who
              ? "Attempts appear here as soon as students start taking exams."
              : "No attempts match these filters."
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Student</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Result</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attempts.map((attempt) => {
                    const passed =
                      attempt.percentage !== null &&
                      attempt.percentage >= attempt.subject.passMark;

                    return (
                      <TableRow key={attempt.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/attempts?userId=${attempt.user.id}`}
                              className="text-sm font-medium hover:text-primary hover:underline"
                            >
                              {attempt.user.name ?? attempt.user.email}
                            </Link>
                            {attempt.user.role === "GUEST" && (
                              <Badge variant="secondary">Guest</Badge>
                            )}
                          </div>
                          {/* A guest's address is synthetic, so showing it would be noise. */}
                          <p className="truncate text-xs text-muted-foreground">
                            {attempt.user.role === "GUEST" ? "Access code session" : attempt.user.email}
                          </p>
                        </TableCell>

                        <TableCell>
                          <Link
                            href={`/admin/subjects/${attempt.subject.id}`}
                            className="text-sm hover:text-primary hover:underline"
                          >
                            {attempt.subject.title}
                          </Link>
                        </TableCell>

                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {attempt.attemptNumber}
                        </TableCell>

                        <TableCell>
                          <Badge variant={STATUS_VARIANT[attempt.status]}>
                            {STATUS_LABEL[attempt.status]}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right tabular-nums">
                          {attempt.score === null || attempt.totalPoints === null
                            ? "—"
                            : `${attempt.score}/${attempt.totalPoints}`}
                        </TableCell>

                        <TableCell className="text-right">
                          {attempt.percentage === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                passed
                                  ? "font-medium tabular-nums text-success"
                                  : "font-medium tabular-nums text-destructive"
                              }
                            >
                              {attempt.percentage.toFixed(1)}%
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatDuration(attempt.timeSpentSec)}
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(attempt.startedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <p className="text-muted-foreground">
                Page {page} of {pageCount} · {total} attempt{total === 1 ? "" : "s"}
              </p>
              <div className="flex gap-2">
                <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
                  {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span>Previous</span>}
                </Button>
                <Button
                  asChild={page < pageCount}
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount}
                >
                  {page < pageCount ? <Link href={pageHref(page + 1)}>Next</Link> : <span>Next</span>}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
