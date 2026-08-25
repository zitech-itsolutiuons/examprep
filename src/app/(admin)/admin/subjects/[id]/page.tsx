import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileQuestion,
  ListChecks,
  Tags,
  Users,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { SubjectDetailActions } from "@/components/admin/subject-detail-actions";
import { TopicManager, type TopicRow } from "@/components/admin/topic-manager";

type Params = { params: { id: string } };

export async function generateMetadata({ params }: Params) {
  const subject = await prisma.subject.findUnique({
    where: { id: params.id },
    select: { title: true },
  });
  return { title: subject?.title ?? "Subject" };
}

export default async function AdminSubjectDetailPage({ params }: Params) {
  await requireAdmin();

  const subject = await prisma.subject.findUnique({
    where: { id: params.id },
    include: {
      createdBy: { select: { name: true, email: true } },
      topics: {
        orderBy: { name: "asc" },
        include: { _count: { select: { questions: true } } },
      },
      _count: { select: { questions: true, attempts: true } },
    },
  });

  if (!subject) notFound();

  const activeQuestions = await prisma.question.count({
    where: { subjectId: subject.id, isActive: true },
  });

  const topics: TopicRow[] = subject.topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    description: topic.description,
    questionCount: topic._count.questions,
  }));

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link
            href="/admin/subjects"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All subjects
          </Link>
        }
        title={subject.title}
        description={subject.description ?? "No description yet."}
        actions={
          <SubjectDetailActions
            subject={{
              id: subject.id,
              title: subject.title,
              description: subject.description ?? "",
              imageUrl: subject.imageUrl ?? "",
              durationMin: subject.durationMin,
              passMark: subject.passMark,
              isActive: subject.isActive,
            }}
            isPublished={subject.isPublished}
          />
        }
      />

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={subject.isPublished ? "success" : "outline"}>
            {subject.isPublished ? "Published" : "Draft"}
          </Badge>
          <Badge variant={subject.isActive ? "secondary" : "destructive"}>
            {subject.isActive ? "Active" : "Inactive"}
          </Badge>
          <span className="text-xs text-muted-foreground">/{subject.slug}</span>
        </div>

        {!subject.isPublished && activeQuestions === 0 && (
          <Alert variant="info">
            <FileQuestion />
            <AlertTitle>Not ready to publish</AlertTitle>
            <AlertDescription>
              Add at least one active question before publishing this subject.
            </AlertDescription>
          </Alert>
        )}

        {subject.isPublished && !subject.isActive && (
          <Alert variant="warning">
            <CheckCircle2 />
            <AlertTitle>Hidden from students</AlertTitle>
            <AlertDescription>
              This subject is published but inactive, so students can&apos;t see it. Activate it to
              make it available.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Questions"
            value={subject._count.questions}
            hint={`${activeQuestions} active`}
            icon={FileQuestion}
          />
          <StatCard label="Topics" value={topics.length} icon={Tags} />
          <StatCard label="Attempts" value={subject._count.attempts} icon={Users} />
          <StatCard
            label="Duration"
            value={`${subject.durationMin}m`}
            hint={`Pass mark ${subject.passMark}%`}
            icon={Clock}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1.5">
                <CardTitle>Question bank</CardTitle>
                <CardDescription>
                  Add, edit, and deactivate the questions students will answer.
                </CardDescription>
              </div>
              <Button asChild>
                <Link href={`/admin/subjects/${subject.id}/questions`}>
                  <ListChecks />
                  Manage questions
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Total questions</dt>
                  <dd className="font-medium tabular-nums">{subject._count.questions}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Active questions</dt>
                  <dd className="font-medium tabular-nums">{activeQuestions}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created by</dt>
                  <dd className="font-medium">
                    {subject.createdBy?.name ?? subject.createdBy?.email ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium">
                    {subject.createdAt.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Topics</CardTitle>
              <CardDescription>Group questions so they can be filtered later.</CardDescription>
            </CardHeader>
            <CardContent>
              <TopicManager subjectId={subject.id} topics={topics} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
