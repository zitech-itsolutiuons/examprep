import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { QuestionsManager, type QuestionRow } from "@/components/admin/questions-manager";

type Params = { params: { id: string } };

export async function generateMetadata({ params }: Params) {
  const subject = await prisma.subject.findUnique({
    where: { id: params.id },
    select: { title: true },
  });
  return { title: subject ? `${subject.title} questions` : "Questions" };
}

export default async function AdminSubjectQuestionsPage({ params }: Params) {
  await requireAdmin();

  const subject = await prisma.subject.findUnique({
    where: { id: params.id },
    include: {
      topics: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      questions: {
        orderBy: { createdAt: "asc" },
        include: {
          options: { orderBy: { order: "asc" } },
          topic: { select: { id: true, name: true } },
          _count: { select: { userAnswers: true } },
        },
      },
    },
  });

  if (!subject) notFound();

  const questions: QuestionRow[] = subject.questions.map((question) => ({
    id: question.id,
    text: question.text,
    type: question.type,
    difficulty: question.difficulty,
    points: question.points,
    isActive: question.isActive,
    explanation: question.explanation,
    topicId: question.topicId,
    topicName: question.topic?.name ?? null,
    answerCount: question._count.userAnswers,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      isCorrect: option.isCorrect,
    })),
  }));

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link
            href={`/admin/subjects/${subject.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {subject.title}
          </Link>
        }
        title="Questions"
        description="Everything students will be asked in this subject."
        actions={
          <Badge variant={subject.isPublished ? "success" : "outline"}>
            {subject.isPublished ? "Published" : "Draft"}
          </Badge>
        }
      />

      <QuestionsManager
        subjectId={subject.id}
        topics={subject.topics}
        questions={questions}
      />
    </div>
  );
}
