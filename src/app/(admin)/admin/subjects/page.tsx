import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { ExamAttemptModel, QuestionModel, SubjectModel, TopicModel } from "@/models";
import { requireAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { SubjectsManager, type SubjectRow } from "@/components/admin/subjects-manager";
import { countByParent } from "@/server/services/counts";

export const metadata = { title: "Subjects" };

export default async function AdminSubjectsPage() {
  await requireAdmin();

  await connectToDatabase();

  const raw = await SubjectModel.find().sort({ createdAt: -1 }).lean();

  const subjects = normalizeIds(raw) as unknown as Array<{
    id: string;
    title: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    durationMin: number;
    passMark: number;
    isPublished: boolean;
    isActive: boolean;
  }>;

  const ids = subjects.map((subject) => subject.id);

  // Was three `_count` selects inside the query — now three grouped counts for the whole
  // page, so the cost doesn't scale with the number of subjects listed.
  const [questions, topics, attempts] = await Promise.all([
    countByParent(QuestionModel, "subjectId", ids),
    countByParent(TopicModel, "subjectId", ids),
    countByParent(ExamAttemptModel, "subjectId", ids),
  ]);

  const rows: SubjectRow[] = subjects.map((subject) => ({
    id: subject.id,
    title: subject.title,
    slug: subject.slug,
    description: subject.description,
    imageUrl: subject.imageUrl,
    durationMin: subject.durationMin,
    passMark: subject.passMark,
    isPublished: subject.isPublished,
    isActive: subject.isActive,
    questionCount: questions.get(subject.id) ?? 0,
    topicCount: topics.get(subject.id) ?? 0,
    attemptCount: attempts.get(subject.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Create subjects, add questions, then publish them for students."
      />
      <SubjectsManager subjects={rows} />
    </div>
  );
}
