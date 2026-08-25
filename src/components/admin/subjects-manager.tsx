"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  Eye,
  EyeOff,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { SubjectFormDialog, type SubjectFormValues } from "@/components/admin/subject-form-dialog";

export type SubjectRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  durationMin: number;
  passMark: number;
  isPublished: boolean;
  isActive: boolean;
  questionCount: number;
  topicCount: number;
  attemptCount: number;
};

function toFormValues(subject: SubjectRow): SubjectFormValues {
  return {
    id: subject.id,
    title: subject.title,
    description: subject.description ?? "",
    imageUrl: subject.imageUrl ?? "",
    durationMin: subject.durationMin,
    passMark: subject.passMark,
    isActive: subject.isActive,
  };
}

export function SubjectsManager({ subjects }: { subjects: SubjectRow[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SubjectFormValues | undefined>();
  const [deleting, setDeleting] = React.useState<SubjectRow | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(
      (s) => s.title.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)
    );
  }, [subjects, query]);

  async function patchSubject(subject: SubjectRow, patch: Record<string, boolean>, label: string) {
    setBusyId(subject.id);
    const res = await fetch(`/api/admin/subjects/${subject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);

    if (!res.ok) {
      toast.error(data.error ?? "Could not update the subject.");
      return;
    }

    toast.success(label);
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusyId(deleting.id);
    const res = await fetch(`/api/admin/subjects/${deleting.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);

    if (!res.ok) {
      toast.error(data.error ?? "Could not delete the subject.");
      return;
    }

    toast.success("Subject deleted.");
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search subjects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus />
          New subject
        </Button>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects yet"
          description="Create a subject, add questions to it, then publish it so students can take the exam."
          action={
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus />
              Create your first subject
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description={`Nothing matches “${query}”.`} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Questions</TableHead>
                <TableHead className="text-right">Topics</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((subject) => (
                <TableRow key={subject.id} data-busy={busyId === subject.id || undefined}>
                  <TableCell className="max-w-xs">
                    <Link
                      href={`/admin/subjects/${subject.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {subject.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">/{subject.slug}</p>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={subject.isPublished ? "success" : "outline"}>
                        {subject.isPublished ? "Published" : "Draft"}
                      </Badge>
                      {!subject.isActive && <Badge variant="destructive">Inactive</Badge>}
                    </div>
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {subject.questionCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{subject.topicCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{subject.attemptCount}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {subject.durationMin}m
                  </TableCell>

                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${subject.title}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/subjects/${subject.id}/questions`}>
                            <ListChecks />
                            Manage questions
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(toFormValues(subject));
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                          Edit details
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          onSelect={() =>
                            patchSubject(
                              subject,
                              { isPublished: !subject.isPublished },
                              subject.isPublished ? "Subject unpublished." : "Subject published."
                            )
                          }
                        >
                          {subject.isPublished ? <EyeOff /> : <Eye />}
                          {subject.isPublished ? "Unpublish" : "Publish"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            patchSubject(
                              subject,
                              { isActive: !subject.isActive },
                              subject.isActive ? "Subject deactivated." : "Subject activated."
                            )
                          }
                        >
                          <Power />
                          {subject.isActive ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem destructive onSelect={() => setDeleting(subject)}>
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <SubjectFormDialog open={formOpen} onOpenChange={setFormOpen} subject={editing} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.title}”?`}
        description={
          deleting?.attemptCount
            ? "This subject has recorded attempts, so it can't be deleted. Deactivate it instead to hide it from students while keeping results."
            : "This permanently removes the subject along with its topics and questions. This cannot be undone."
        }
        confirmLabel="Delete subject"
        loading={busyId === deleting?.id}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
