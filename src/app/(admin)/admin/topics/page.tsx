import Link from "next/link";
import { Tags } from "lucide-react";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { QuestionModel, SubjectModel } from "@/models";
import { requireAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { TopicManager, type TopicRow } from "@/components/admin/topic-manager";
import { countByParent } from "@/server/services/counts";

export const metadata = { title: "Topics" };

export default async function AdminTopicsPage() {
  await requireAdmin();

  await connectToDatabase();

  const raw = await SubjectModel.find()
    .sort({ title: 1 })
    .select("title isPublished")
    .populate({ path: "topics", options: { sort: { name: 1 } } })
    .lean();

  const subjects = normalizeIds(raw) as unknown as Array<{
    id: string;
    title: string;
    isPublished: boolean;
    topics: Array<{ id: string; name: string; description: string | null }>;
  }>;

  // Every topic across every subject is counted in one pass, so adding a subject doesn't
  // add a query — this page renders the whole tree at once.
  const questionCounts = await countByParent(
    QuestionModel,
    "topicId",
    subjects.flatMap((subject) => (subject.topics ?? []).map((topic) => topic.id))
  );

  return (
    <div>
      <PageHeader
        title="Topics"
        description="Organise each subject's questions into topics or categories."
      />

      {subjects.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No subjects yet"
          description="Topics belong to a subject — create a subject first."
          action={
            <Button asChild>
              <Link href="/admin/subjects">Go to subjects</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {subjects.map((subject) => {
            const topics: TopicRow[] = (subject.topics ?? []).map((topic) => ({
              id: topic.id,
              name: topic.name,
              description: topic.description,
              questionCount: questionCounts.get(topic.id) ?? 0,
            }));

            return (
              <Card key={subject.id}>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1.5">
                    <CardTitle>
                      <Link
                        href={`/admin/subjects/${subject.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {subject.title}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {topics.length} {topics.length === 1 ? "topic" : "topics"}
                    </CardDescription>
                  </div>
                  <Badge variant={subject.isPublished ? "success" : "outline"}>
                    {subject.isPublished ? "Published" : "Draft"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <TopicManager subjectId={subject.id} topics={topics} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
