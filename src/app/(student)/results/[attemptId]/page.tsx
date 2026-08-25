import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  CircleSlash,
  Clock,
  Timer,
  TrendingUp,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { requireUser } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { ResultsReview } from "@/components/student/results-review";
import { StartExamButton } from "@/components/student/start-exam-button";
import { formatDuration, loadAttemptResult } from "@/server/services/results";

type Params = { params: { attemptId: string } };

export const metadata = { title: "Result" };
export const dynamic = "force-dynamic";

export default async function ResultsPage({ params }: Params) {
  const user = await requireUser();

  // Owner-scoped and submitted-only: another student's attempt, or one still running,
  // is a 404 here rather than a partial view.
  const result = await loadAttemptResult(params.attemptId, user.id);
  if (!result) notFound();

  const { subject, history } = result;
  const delta =
    history.previousPercentage === null
      ? null
      : Math.round((result.percentage - history.previousPercentage) * 10) / 10;

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link
            href={`/subjects/${subject.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="h-4 w-4" />
            {subject.title}
          </Link>
        }
        title={`Attempt #${result.attemptNumber} result`}
        description={`Submitted ${result.submittedAt.toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/subjects">Another subject</Link>
            </Button>
            <StartExamButton subjectId={subject.id} mode="retake" />
          </div>
        }
      />

      <div className="space-y-6">
        {result.isAutoSubmitted && (
          <Alert variant="warning">
            <Timer />
            <AlertTitle>Submitted automatically</AlertTitle>
            <AlertDescription>
              The time limit ran out, so this attempt was submitted and marked as it stood.
            </AlertDescription>
          </Alert>
        )}

        {/* Score summary */}
        <Card
          className={cn(
            "border-l-4",
            result.passed ? "border-l-success" : "border-l-destructive"
          )}
        >
          <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-5xl font-semibold tabular-nums tracking-tight">
                  {result.percentage.toFixed(1)}
                  <span className="text-2xl text-muted-foreground">%</span>
                </span>
                <Badge variant={result.passed ? "success" : "destructive"}>
                  {result.passed ? (
                    <>
                      <CheckCircle2 />
                      Passed
                    </>
                  ) : (
                    <>
                      <XCircle />
                      Below pass mark
                    </>
                  )}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {result.score}/{result.totalPoints}
                </span>{" "}
                points · pass mark {subject.passMark}%
              </p>

              <div className="max-w-sm space-y-1.5">
                <Progress
                  value={result.percentage}
                  indicatorClassName={result.passed ? "bg-success" : "bg-destructive"}
                />
                <p className="text-xs text-muted-foreground">
                  {result.passed
                    ? `${(result.percentage - subject.passMark).toFixed(1)} points above the pass mark`
                    : `${(subject.passMark - result.percentage).toFixed(1)} points short of the pass mark`}
                </p>
              </div>
            </div>

            <dl className="grid shrink-0 grid-cols-3 gap-4 text-center sm:gap-6">
              <div>
                <dd className="text-2xl font-semibold tabular-nums text-success">
                  {result.correctCount}
                </dd>
                <dt className="text-xs text-muted-foreground">Correct</dt>
              </div>
              <div>
                <dd className="text-2xl font-semibold tabular-nums text-destructive">
                  {result.incorrectCount}
                </dd>
                <dt className="text-xs text-muted-foreground">Wrong</dt>
              </div>
              <div>
                <dd className="text-2xl font-semibold tabular-nums text-warning-foreground dark:text-warning">
                  {result.unansweredCount}
                </dd>
                <dt className="text-xs text-muted-foreground">Unanswered</dt>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="This attempt"
            value={`${result.percentage.toFixed(1)}%`}
            hint={
              delta === null
                ? "Your first attempt"
                : delta === 0
                  ? "Same as last attempt"
                  : `vs ${history.previousPercentage!.toFixed(1)}% last time`
            }
            delta={delta}
            icon={TrendingUp}
          />
          <StatCard
            label="Best score"
            value={`${history.bestPercentage.toFixed(1)}%`}
            hint={`Across ${history.attemptsCount} attempt${history.attemptsCount === 1 ? "" : "s"}`}
            icon={CheckCircle2}
          />
          <StatCard
            label="Average"
            value={`${history.averagePercentage.toFixed(1)}%`}
            hint="All submitted attempts"
            icon={CircleSlash}
          />
          <StatCard
            label="Time spent"
            value={formatDuration(result.timeSpentSec)}
            hint={`Limit ${subject.durationMin}m`}
            icon={Clock}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Answer review</CardTitle>
            <CardDescription>
              Every question with your answer, the correct answer, and a correction where you
              went wrong. Use <span className="font-medium text-foreground">Mistakes only</span>{" "}
              to focus on what to study next.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResultsReview questions={result.questions} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
