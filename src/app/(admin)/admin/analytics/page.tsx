import Link from "next/link";
import { Award, BarChart3, FileQuestion, Percent, Target } from "lucide-react";

import { requireAdmin } from "@/lib/rbac";
import {
  getHardestQuestions,
  getPlatformOverview,
  getScoreDistribution,
  getSubjectStats,
} from "@/server/services/analytics";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScoreDistributionChart } from "@/components/admin/score-distribution-chart";

export const metadata = { title: "Analytics" };

function pct(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

export default async function AdminAnalyticsPage() {
  await requireAdmin();

  const [overview, subjectStats, hardest, distribution] = await Promise.all([
    getPlatformOverview(),
    getSubjectStats(),
    getHardestQuestions(10, 1),
    getScoreDistribution(),
  ]);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="How students are performing across subjects, and which questions trip them up."
      />

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Attempts submitted"
            value={overview.submittedAttempts}
            hint={`${overview.inProgressAttempts} in progress`}
            icon={BarChart3}
          />
          <StatCard
            label="Average score"
            value={pct(overview.averagePercentage)}
            hint="Across all submitted attempts"
            icon={Percent}
          />
          <StatCard
            label="Pass rate"
            value={pct(overview.passRate)}
            hint="Measured against each subject's pass mark"
            icon={Target}
          />
          <StatCard
            label="Active questions"
            value={overview.activeQuestions}
            hint={`${overview.questions} in total`}
            icon={FileQuestion}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
            <CardDescription>
              How submitted attempts spread across ten-point score bands.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreDistributionChart buckets={distribution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subject performance</CardTitle>
            <CardDescription>
              Average score, best score, and pass rate per subject.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {subjectStats.length === 0 ? (
              <EmptyState
                icon={Award}
                title="No subjects yet"
                description="Create and publish a subject to start collecting performance data."
                className="mx-6 mb-6"
              />
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Subject</TableHead>
                      <TableHead className="text-right">Questions</TableHead>
                      <TableHead className="text-right">Attempts</TableHead>
                      <TableHead className="text-right">Average</TableHead>
                      <TableHead className="text-right">Best</TableHead>
                      <TableHead className="text-right">Pass mark</TableHead>
                      <TableHead className="w-40">Pass rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subjectStats.map((stat) => (
                      <TableRow key={stat.id}>
                        <TableCell>
                          <Link
                            href={`/admin/subjects/${stat.id}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {stat.title}
                          </Link>
                          {!stat.isPublished && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              Draft
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stat.questionCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stat.attemptCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(stat.averagePercentage)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pct(stat.bestPercentage)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {stat.passMark}%
                        </TableCell>
                        <TableCell>
                          {stat.passRate === null ? (
                            <span className="text-sm text-muted-foreground">No attempts</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Progress
                                value={stat.passRate}
                                className="h-2"
                                indicatorClassName={
                                  stat.passRate >= 50 ? "bg-success" : "bg-destructive"
                                }
                              />
                              <span className="w-10 shrink-0 text-right text-xs tabular-nums">
                                {stat.passRate}%
                              </span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most-missed questions</CardTitle>
            <CardDescription>
              Ranked by how rarely students answer them correctly. A very low rate often means
              the wording needs a second look.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hardest.length === 0 ? (
              <EmptyState
                icon={FileQuestion}
                title="Not enough answers yet"
                description="This ranking appears once students have submitted attempts."
                className="py-10"
              />
            ) : (
              <ol className="space-y-3">
                {hardest.map((question, index) => (
                  <li key={question.id} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium leading-relaxed">{question.text}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Link
                          href={`/admin/subjects/${question.subjectId}/questions`}
                          className="hover:text-primary hover:underline"
                        >
                          {question.subjectTitle}
                        </Link>
                        <span>·</span>
                        <span className="tabular-nums">
                          {question.correct}/{question.answered} correct
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant={
                        question.correctRate < 34
                          ? "destructive"
                          : question.correctRate < 67
                            ? "warning"
                            : "success"
                      }
                    >
                      {question.correctRate}%
                    </Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
