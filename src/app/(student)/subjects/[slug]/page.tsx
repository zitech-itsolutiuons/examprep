import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileQuestion,
  Flag,
  History,
  Save,
  Tags,
  Target,
} from "lucide-react";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { ExamAttemptModel, QuestionModel, SubjectModel } from "@/models";
import { requireUser } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { StartExamButton } from "@/components/student/start-exam-button";
import { STUDENT_SUBJECT_FILTER } from "@/server/services/attempts";
import { countByParent } from "@/server/services/counts";

type Params = { params: { slug: string } };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params) {
  await connectToDatabase();
  const subject = await SubjectModel.findOne({ slug: params.slug, ...STUDENT_SUBJECT_FILTER })
    .select("title")
    .lean();
  return { title: subject?.title ?? "Subject" };
}

const RULES = [
  { icon: Save, text: "Answers save automatically as you go — a reload never loses your work." },
  { icon: Flag, text: "Flag anything you want to revisit, and skip freely in any order." },
  { icon: Clock, text: "The timer runs from the moment you start and submits for you at zero." },
  { icon: CheckCircle2, text: "Marking happens on the server after you submit; results are final." },
];

export default async function SubjectDetailPage({ params }: Params) {
  const user = await requireUser();

  await connectToDatabase();

  const raw = await SubjectModel.findOne({ slug: params.slug, ...STUDENT_SUBJECT_FILTER })
    .select("slug title description durationMin passMark")
    .populate({ path: "topics", select: "name", options: { sort: { name: 1 } } })
    .lean();

  // A draft, deactivated, or non-existent subject is all the same 404 to a student.
  if (!raw) notFound();

  const subject = normalizeIds(raw) as unknown as {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    durationMin: number;
    passMark: number;
    topics: Array<{ id: string; name: string }>;
  };

  const [questionCount, topicQuestionCounts, attemptsRaw] = await Promise.all([
    QuestionModel.countDocuments({ subjectId: subject.id, isActive: true }),
    // Was the nested `_count` inside `topics`.
    countByParent(
      QuestionModel,
      "topicId",
      (subject.topics ?? []).map((topic) => topic.id)
    ),
    // Scoped to this user: nobody can read another student's attempts from this page.
    ExamAttemptModel.find({ userId: user.id, subjectId: subject.id })
      .sort({ startedAt: -1 })
      .select("status attemptNumber percentage score totalPoints startedAt submittedAt")
      .lean(),
  ]);

  const attempts = normalizeIds(attemptsRaw) as unknown as Array<{
    id: string;
    status: string;
    attemptNumber: number;
    percentage: number | null;
    score: number | null;
    totalPoints: number | null;
    startedAt: Date;
    submittedAt: Date | null;
  }>;

  const live = attempts.find((attempt) => attempt.status === "IN_PROGRESS");
  const submitted = attempts.filter((attempt) => attempt.status === "SUBMITTED");
  const percentages = submitted.map((attempt) => attempt.percentage ?? 0);
  const best = percentages.length > 0 ? Math.max(...percentages) : null;
  const average =
    percentages.length > 0
      ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
      : null;

  const hasQuestions = questionCount > 0;

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link
            href="/subjects"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All subjects
          </Link>
        }
        title={subject.title}
        description={subject.description ?? "No description provided."}
        actions={
          hasQuestions ? (
            <StartExamButton
              subjectId={subject.id}
              mode={live ? "resume" : submitted.length > 0 ? "retake" : "start"}
            />
          ) : undefined
        }
      />

      <div className="space-y-6">
        {!hasQuestions && (
          <Alert variant="warning">
            <FileQuestion />
            <AlertTitle>Not ready yet</AlertTitle>
            <AlertDescription>
              This subject has no active questions, so it can&apos;t be sat right now.
            </AlertDescription>
          </Alert>
        )}

        {live && (
          <Alert variant="info">
            <Clock />
            <AlertTitle>You have an attempt in progress</AlertTitle>
            <AlertDescription>
              Attempt #{live.attemptNumber} is still open. Resuming continues the same timer —
              starting fresh isn&apos;t possible until this one is submitted.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Questions" value={questionCount} icon={FileQuestion} />
          <StatCard
            label="Time limit"
            value={`${subject.durationMin}m`}
            hint={`Pass mark ${subject.passMark}%`}
            icon={Clock}
          />
          <StatCard
            label="Your best"
            value={best === null ? "—" : `${best.toFixed(0)}%`}
            hint={best === null ? "No submitted attempts" : best >= subject.passMark ? "Passed" : "Below pass mark"}
            icon={Target}
          />
          <StatCard
            label="Attempts"
            value={submitted.length}
            hint={average === null ? "—" : `Average ${average.toFixed(1)}%`}
            icon={History}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Your attempts</CardTitle>
              <CardDescription>
                Every attempt is kept, so a retake never replaces an earlier result.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attempts.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No attempts yet"
                  description="Start the exam whenever you're ready — you can retake it as many times as you want."
                  className="py-10"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {attempts.map((attempt) => {
                    const pending = attempt.status === "IN_PROGRESS";
                    const pct = attempt.percentage ?? 0;
                    const passed = pct >= subject.passMark;

                    return (
                      <li
                        key={attempt.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              Attempt #{attempt.attemptNumber}
                            </span>
                            {pending ? (
                              <Badge variant="warning">In progress</Badge>
                            ) : (
                              <Badge variant={passed ? "success" : "destructive"}>
                                {passed ? "Passed" : "Failed"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {(attempt.submittedAt ?? attempt.startedAt).toLocaleString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          {!pending && (
                            <span className="text-sm font-semibold tabular-nums">
                              {pct.toFixed(0)}%
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                {attempt.score}/{attempt.totalPoints}
                              </span>
                            </span>
                          )}
                          <Button asChild variant="outline" size="sm">
                            <Link href={pending ? `/exam/${attempt.id}` : `/results/${attempt.id}`}>
                              {pending ? "Resume" : "Review"}
                            </Link>
                          </Button>
                        </div>
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
                <CardTitle>How this exam works</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {RULES.map(({ icon: Icon, text }) => (
                    <li key={text} className="flex gap-2.5 text-sm text-muted-foreground">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {subject.topics.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Tags className="h-4 w-4" />
                    Topics covered
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {subject.topics.map((topic) => (
                    <Badge key={topic.id} variant="outline">
                      {topic.name}
                      <span className="tabular-nums opacity-60">
                        {topicQuestionCounts.get(topic.id) ?? 0}
                      </span>
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
