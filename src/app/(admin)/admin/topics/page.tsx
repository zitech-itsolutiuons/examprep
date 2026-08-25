import Link from "next/link";
import { Tags } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { TopicManager, type TopicRow } from "@/components/admin/topic-manager";

export const metadata = { title: "Topics" };

export default async function AdminTopicsPage() {
  await requireAdmin();

  const subjects = await prisma.subject.findMany({
    orderBy: { title: "asc" },
    include: {
      topics: {
        orderBy: { name: "asc" },
        include: { _count: { select: { questions: true } } },
      },
    },
  });

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
            const topics: TopicRow[] = subject.topics.map((topic) => ({
              id: topic.id,
              name: topic.name,
              description: topic.description,
              questionCount: topic._count.questions,
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
