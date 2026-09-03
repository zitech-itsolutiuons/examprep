import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { SubjectModel, TopicModel } from "@/models";
import { requireAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { QuestionsManager, type QuestionRow } from "@/components/admin/questions-manager";
import { loadAdminQuestions } from "@/server/services/questions";
import type { Difficulty, QuestionType } from "@/types/models";

type Params = { params: { id: string } };

export async function generateMetadata({ params }: Params) {
  await connectToDatabase();
  const subject = await SubjectModel.findOne({ _id: params.id }).select("title").lean();
  return { title: subject ? `${subject.title} questions` : "Questions" };
}

export default async function AdminSubjectQuestionsPage({ params }: Params) {
  await requireAdmin();

  await connectToDatabase();

  const subjectRaw = await SubjectModel.findOne({ _id: params.id })
    .select("title isPublished")
    .lean();

  if (!subjectRaw) notFound();

  const subject = normalizeIds(subjectRaw) as unknown as {
    id: string;
    title: string;
    isPublished: boolean;
  };

  // The questions come from the shared admin loader, so this page and
  // `GET /api/admin/questions` return the same shape from one implementation.
  const [topicsRaw, loaded] = await Promise.all([
    TopicModel.find({ subjectId: subject.id }).sort({ name: 1 }).select("name").lean(),
    loadAdminQuestions({ subjectId: subject.id }),
  ]);

  const topics = (normalizeIds(topicsRaw) as unknown as Array<{ id: string; name: string }>).map(
    (topic) => ({ id: topic.id, name: topic.name })
  );

  const questions: QuestionRow[] = loaded.map((question) => {
    const row = question as typeof question & {
      text: string;
      type: QuestionType;
      difficulty: Difficulty;
      points: number;
      isActive: boolean;
      explanation: string | null;
      topicId: string | null;
      topic: { name: string } | null;
      options: Array<{ id: string; text: string; isCorrect: boolean }>;
    };

    return {
      id: row.id,
      text: row.text,
      type: row.type,
      difficulty: row.difficulty,
      points: row.points,
      isActive: row.isActive,
      explanation: row.explanation,
      topicId: row.topicId,
      topicName: row.topic?.name ?? null,
      answerCount: row._count.userAnswers,
      options: (row.options ?? []).map((option) => ({
        id: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    };
  });

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
        topics={topics}
        questions={questions}
      />
    </div>
  );
}
