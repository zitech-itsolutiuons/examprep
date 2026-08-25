import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { SubjectsManager, type SubjectRow } from "@/components/admin/subjects-manager";

export const metadata = { title: "Subjects" };

export default async function AdminSubjectsPage() {
  await requireAdmin();

  const subjects = await prisma.subject.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { questions: true, topics: true, attempts: true } },
    },
  });

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
    questionCount: subject._count.questions,
    topicCount: subject._count.topics,
    attemptCount: subject._count.attempts,
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
