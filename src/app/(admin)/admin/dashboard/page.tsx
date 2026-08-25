import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FileQuestion,
  Percent,
  Plus,
  Target,
  Users,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { getPlatformOverview, getSubjectStats } from "@/server/services/analytics";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";

export const metadata = { title: "Admin overview" };

function formatDateTime(value: Date) {
  return value.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminDashboardPage() {
  await requireAdmin();

  const [overview, subjectStats, recentAttempts, draftSubjects] = await Promise.all([
    getPlatformOverview(),
    getSubjectStats(),
    prisma.examAttempt.findMany({
      orderBy: { startedAt: "desc" },
      take: 6,
      include: {
        user: { select: { name: true, email: true } },
        subject: { select: { id: true, title: true, passMark: true } },
      },
    }),
    prisma.subject.findMany({
      where: { isPublished: false },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        _count: { select: { questions: true } },
      },
    }),
  ]);

  const busiest = [...subjectStats]
    .filter((stat) => stat.attemptCount > 0)
    .sort((a, b) => b.attemptCount - a.attemptCount)
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Users, subjects, questions, and attempt activity at a glance."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/analytics">
                <BarChart3 />
                Analytics
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/subjects">
                <Plus />
                New subject
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Users"
            value={overview.users}
            hint={`${overview.students} students · ${overview.admins} admin${
              overview.admins === 1 ? "" : "s"
            }`}
            icon={Users}
          />
          <StatCard
            label="Published subjects"
            value={overview.publishedSubjects}
            hint={`${overview.subjects} in total`}
            icon={BookOpen}
          />
          <StatCard
            label="Active questions"
            value={overview.activeQuestions}
            hint={`${overview.questions} in the bank`}
            icon={FileQuestion}
          />
          <StatCard
            label="Attempts"
            value={overview.attempts}
            hint={`${overview.submittedAttempts} submitted · ${overview.inProgressAttempts} live`}
            icon={ClipboardList}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Average score"
            value={overview.averagePercentage === null ? "—" : `${overview.averagePercentage}%`}
            hint="Across every submitted attempt"
            icon={Percent}
          />
          <StatCard
            label="Pass rate"
            value={overview.passRate === null ? "—" : `${overview.passRate}%`}
            hint="Against each subject's own pass mark"
            icon={Target}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>The last few attempts started on the platform.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentAttempts.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No attempts yet"
                  description="Publish a subject and students can begin straight away."
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {recentAttempts.map((attempt) => {
                    const passed =
                      attempt.percentage !== null &&
                      attempt.percentage >= attempt.subject.passMark;

                    return (
                      <li key={attempt.id} className="flex items-center gap-3 py-3 first:pt-0">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {attempt.user.name ?? attempt.user.email}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {attempt.subject.title} · attempt {attempt.attemptNumber} ·{" "}
                            {formatDateTime(attempt.startedAt)}
                          </p>
                        </div>
                        {attempt.percentage === null ? (
                          <Badge variant="warning">In progress</Badge>
                        ) : (
                          <Badge variant={passed ? "success" : "destructive"}>
                            {attempt.percentage.toFixed(0)}%
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Busiest subjects</CardTitle>
                <CardDescription>Ranked by number of attempts.</CardDescription>
              </CardHeader>
              <CardContent>
                {busiest.length === 0 ? (
                  <EmptyState
                    icon={BookOpen}
                    title="No attempt data yet"
                    className="py-8"
                  />
                ) : (
                  <ul className="space-y-3">
                    {busiest.map((stat) => (
                      <li key={stat.id} className="flex items-center gap-3">
                        <Link
                          href={`/admin/subjects/${stat.id}`}
                          className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary hover:underline"
                        >
                          {stat.title}
                        </Link>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          avg {stat.averagePercentage ?? "—"}%
                        </span>
                        <Badge variant="secondary">{stat.attemptCount}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Needs attention</CardTitle>
                <CardDescription>Draft subjects waiting to be published.</CardDescription>
              </CardHeader>
              <CardContent>
                {draftSubjects.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Every subject is published. Nothing waiting.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {draftSubjects.map((subject) => (
                      <li key={subject.id} className="flex items-center gap-3">
                        <Link
                          href={`/admin/subjects/${subject.id}`}
                          className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary hover:underline"
                        >
                          {subject.title}
                        </Link>
                        <Badge variant={subject._count.questions > 0 ? "warning" : "outline"}>
                          {subject._count.questions === 0
                            ? "No questions"
                            : `${subject._count.questions} question${
                                subject._count.questions === 1 ? "" : "s"
                              }`}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
