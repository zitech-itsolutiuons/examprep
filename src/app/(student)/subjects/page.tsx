import Link from "next/link";
import { BookOpen, Clock, FileQuestion, Target } from "lucide-react";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { ExamAttemptModel, QuestionModel, SubjectModel, UserProgressModel } from "@/models";
import { requireUser } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { STUDENT_SUBJECT_FILTER } from "@/server/services/attempts";
import { countByParent } from "@/server/services/counts";

export const metadata = { title: "Subjects" };
export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  const user = await requireUser();

  await connectToDatabase();

  // Only published + active subjects are ever queried, so an unpublished subject is
  // invisible here rather than merely unclickable.
  const raw = await SubjectModel.find(STUDENT_SUBJECT_FILTER)
    .sort({ title: 1 })
    .select("slug title description durationMin passMark")
    .lean();

  const subjects = normalizeIds(raw) as unknown as Array<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    durationMin: number;
    passMark: number;
  }>;

  // Was `_count: { questions: { where: { isActive: true } } }` — one grouped count for the
  // whole page instead of a subquery per subject.
  const questionCounts = await countByParent(
    QuestionModel,
    "subjectId",
    subjects.map((subject) => subject.id),
    { isActive: true }
  );

  const progress = await UserProgressModel.find({ userId: user.id })
    .select("subjectId attemptsCount bestPercentage")
    .lean();
  const progressBySubject = new Map(progress.map((row) => [row.subjectId, row]));

  const inProgress = await ExamAttemptModel.find({ userId: user.id, status: "IN_PROGRESS" })
    .select("subjectId")
    .lean();
  const liveAttempt = new Map(
    inProgress.map((attempt) => [attempt.subjectId, String(attempt._id)])
  );

  const available = subjects.flatMap((subject) => {
    const questionCount = questionCounts.get(subject.id) ?? 0;
    return questionCount > 0 ? [{ ...subject, questionCount }] : [];
  });

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Choose a subject to sit. Every attempt is saved, so you can retake any subject as often as you like."
      />

      {available.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects available yet"
          description="Your administrator hasn't published any subjects with questions. Check back soon."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {available.map((subject) => {
            const stats = progressBySubject.get(subject.id);
            const resumeId = liveAttempt.get(subject.id);

            return (
              <Card key={subject.id} className="flex flex-col">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">{subject.title}</CardTitle>
                    {resumeId && <Badge variant="warning">In progress</Badge>}
                  </div>
                  <CardDescription className="line-clamp-2">
                    {subject.description ?? "No description provided."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="mt-auto space-y-4">
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div className="space-y-1">
                      <dt className="flex items-center gap-1 text-muted-foreground">
                        <FileQuestion className="h-3 w-3" />
                        Questions
                      </dt>
                      <dd className="font-medium tabular-nums">{subject.questionCount}</dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Time
                      </dt>
                      <dd className="font-medium tabular-nums">{subject.durationMin}m</dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="flex items-center gap-1 text-muted-foreground">
                        <Target className="h-3 w-3" />
                        Pass
                      </dt>
                      <dd className="font-medium tabular-nums">{subject.passMark}%</dd>
                    </div>
                  </dl>

                  {stats && (
                    <p className="text-xs text-muted-foreground">
                      Best {stats.bestPercentage.toFixed(0)}% over {stats.attemptsCount} attempt
                      {stats.attemptsCount === 1 ? "" : "s"}
                    </p>
                  )}

                  <Button asChild className="w-full" variant={resumeId ? "success" : "default"}>
                    <Link href={`/subjects/${subject.slug}`}>
                      {resumeId ? "Resume exam" : stats ? "Retake" : "Start exam"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
