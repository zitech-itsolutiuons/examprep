import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Clock,
  LayoutDashboard,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { requireAccount } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { TrendChart } from "@/components/student/trend-chart";
import { getStudentOverview } from "@/server/services/progress";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function minutesLabel(seconds: number) {
  if (seconds <= 0) return "time up";
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m left`;
}

export default async function DashboardPage() {
  const user = await requireAccount();
  const overview = await getStudentOverview(user.id);

  const firstName = (user.name ?? "there").split(" ")[0];
  const hasResults = overview.submittedCount > 0;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={
          hasResults
            ? "Your scores, recent attempts, and where to focus next."
            : "Pick a subject to sit your first exam — your progress starts building from there."
        }
        actions={
          <Button asChild>
            <Link href="/subjects">
              <BookOpen />
              Browse subjects
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Resumable attempts come first — they're time-sensitive. */}
        {overview.live.length > 0 && (
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                {overview.live.length === 1 ? "Exam in progress" : "Exams in progress"}
              </CardTitle>
              <CardDescription>
                The timer keeps running while you&apos;re away — resume before it expires.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.live.map((attempt) => (
                <div
                  key={attempt.attemptId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{attempt.subjectTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      Attempt #{attempt.attemptNumber} · {attempt.answered}/{attempt.total}{" "}
                      answered ·{" "}
                      <span
                        className={cn(
                          attempt.secondsRemaining <= 300 && "font-medium text-destructive"
                        )}
                      >
                        {minutesLabel(attempt.secondsRemaining)}
                      </span>
                    </p>
                  </div>
                  <Button asChild size="sm" variant="success">
                    <Link href={`/exam/${attempt.attemptId}`}>
                      Resume
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Average score"
            value={overview.averagePercentage === null ? "—" : `${overview.averagePercentage}%`}
            hint={
              overview.improvement === null
                ? "Across all attempts"
                : "Recent form vs earlier attempts"
            }
            delta={overview.improvement}
            icon={TrendingUp}
          />
          <StatCard
            label="Best score"
            value={overview.bestPercentage === null ? "—" : `${overview.bestPercentage}%`}
            hint={
              overview.lastPercentage === null
                ? "No attempts yet"
                : `Last attempt ${overview.lastPercentage}%`
            }
            icon={Trophy}
          />
          <StatCard
            label="Pass rate"
            value={overview.passRate === null ? "—" : `${overview.passRate}%`}
            hint={`${overview.submittedCount} attempt${overview.submittedCount === 1 ? "" : "s"} completed`}
            icon={Target}
          />
          <StatCard
            label="Subjects"
            value={`${overview.subjectsAttempted}/${overview.subjectsAvailable}`}
            hint="Attempted of those available"
            icon={BookOpen}
          />
        </div>

        {!hasResults ? (
          <EmptyState
            icon={LayoutDashboard}
            title="No results yet"
            description="Once you submit your first exam, your score, improvement trend, and per-subject breakdown appear here."
            action={
              <Button asChild>
                <Link href="/subjects">
                  <BookOpen />
                  Choose a subject
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Improvement trend</CardTitle>
                <CardDescription>
                  Every submitted attempt in order, scored against its own subject&apos;s pass
                  mark.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart points={overview.trend} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle>By subject</CardTitle>
                  <CardDescription>Best and average per subject.</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/history">
                    All history
                    <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {overview.subjects.map((subject) => {
                    const passed = subject.bestPercentage >= subject.passMark;

                    return (
                      <li key={subject.subjectId} className="space-y-2 py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {subject.isAvailable ? (
                              <Link
                                href={`/subjects/${subject.slug}`}
                                className="truncate text-sm font-medium hover:underline"
                              >
                                {subject.title}
                              </Link>
                            ) : (
                              <span className="truncate text-sm font-medium text-muted-foreground">
                                {subject.title}
                              </span>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {subject.attemptsCount} attempt
                              {subject.attemptsCount === 1 ? "" : "s"} · avg{" "}
                              {subject.averagePercentage}%
                              {subject.delta !== null && subject.delta !== 0 && (
                                <span
                                  className={cn(
                                    "ml-1.5 font-medium",
                                    subject.delta > 0 ? "text-success" : "text-destructive"
                                  )}
                                >
                                  {subject.delta > 0 ? "+" : ""}
                                  {subject.delta}
                                </span>
                              )}
                            </p>
                          </div>
                          <Badge variant={passed ? "success" : "destructive"}>
                            {subject.bestPercentage}%
                          </Badge>
                        </div>

                        <Progress
                          value={subject.bestPercentage}
                          className="h-1.5"
                          indicatorClassName={passed ? "bg-success" : "bg-destructive"}
                        />

                        {!subject.isAvailable && (
                          <p className="text-xs text-muted-foreground">
                            No longer available — your results are kept.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
