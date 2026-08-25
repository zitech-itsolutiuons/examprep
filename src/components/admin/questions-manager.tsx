"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileQuestion,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { CsvImportDialog } from "@/components/admin/csv-import-dialog";
import {
  QuestionFormDialog,
  type QuestionDifficulty,
  type QuestionFormValues,
  type QuestionType,
} from "@/components/admin/question-form-dialog";

export type QuestionRow = {
  id: string;
  text: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  points: number;
  isActive: boolean;
  explanation: string | null;
  topicId: string | null;
  topicName: string | null;
  answerCount: number;
  options: { id: string; text: string; isCorrect: boolean }[];
};

const ALL = "__all__";

const TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Single",
  MULTIPLE_CHOICE: "Multiple",
  TRUE_FALSE: "True/False",
};

const DIFFICULTY_VARIANT: Record<QuestionDifficulty, "success" | "warning" | "destructive"> = {
  EASY: "success",
  MEDIUM: "warning",
  HARD: "destructive",
};

function toFormValues(question: QuestionRow): QuestionFormValues {
  return {
    id: question.id,
    topicId: question.topicId ?? "",
    text: question.text,
    type: question.type,
    difficulty: question.difficulty,
    explanation: question.explanation ?? "",
    points: question.points,
    isActive: question.isActive,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      isCorrect: option.isCorrect,
    })),
  };
}

export function QuestionsManager({
  subjectId,
  topics,
  questions,
}: {
  subjectId: string;
  topics: { id: string; name: string }[];
  questions: QuestionRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [topicFilter, setTopicFilter] = React.useState<string>(ALL);
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<QuestionFormValues | undefined>();
  const [deleting, setDeleting] = React.useState<QuestionRow | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return questions.filter((question) => {
      if (q && !question.text.toLowerCase().includes(q)) return false;
      if (topicFilter !== ALL) {
        if (topicFilter === "none" ? question.topicId !== null : question.topicId !== topicFilter) {
          return false;
        }
      }
      if (statusFilter === "active" && !question.isActive) return false;
      if (statusFilter === "inactive" && question.isActive) return false;
      return true;
    });
  }, [questions, query, topicFilter, statusFilter]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function toggleActive(question: QuestionRow) {
    setBusyId(question.id);
    const res = await fetch(`/api/admin/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !question.isActive }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);

    if (!res.ok) {
      toast.error(data.error ?? "Could not update the question.");
      return;
    }

    toast.success(question.isActive ? "Question deactivated." : "Question activated.");
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusyId(deleting.id);
    const res = await fetch(`/api/admin/questions/${deleting.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);

    if (!res.ok) {
      toast.error(data.error ?? "Could not delete the question.");
      return;
    }

    toast.success("Question deleted.");
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search question text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Select value={topicFilter} onValueChange={setTopicFilter}>
          <SelectTrigger className="lg:w-44">
            <SelectValue placeholder="All topics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All topics</SelectItem>
            <SelectItem value="none">No topic</SelectItem>
            {topics.map((topic) => (
              <SelectItem key={topic.id} value={topic.id}>
                {topic.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="lg:w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload />
          Import CSV
        </Button>

        <Button onClick={openCreate}>
          <Plus />
          New question
        </Button>
      </div>

      {questions.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="No questions yet"
          description="A subject needs at least one active question before it can be published."
          action={
            <Button onClick={openCreate}>
              <Plus />
              Add the first question
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No questions match these filters"
          description="Try clearing the search or choosing a different topic."
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Showing {filtered.length} of {questions.length} question
            {questions.length === 1 ? "" : "s"}
          </p>

          <div className="space-y-3">
            {filtered.map((question, index) => {
              const isOpen = expanded.has(question.id);
              return (
                <Card key={question.id} className={cn(!question.isActive && "opacity-70")}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(question.id)}
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Collapse options" : "Show options"}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-sm font-medium leading-relaxed">
                          <span className="mr-2 text-muted-foreground tabular-nums">
                            {index + 1}.
                          </span>
                          {question.text}
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">{TYPE_LABELS[question.type]}</Badge>
                          <Badge variant={DIFFICULTY_VARIANT[question.difficulty]}>
                            {question.difficulty.toLowerCase()}
                          </Badge>
                          <Badge variant="outline">
                            {question.points} {question.points === 1 ? "pt" : "pts"}
                          </Badge>
                          {question.topicName && (
                            <Badge variant="outline">{question.topicName}</Badge>
                          )}
                          {!question.isActive && <Badge variant="destructive">Inactive</Badge>}
                          {question.answerCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              answered in {question.answerCount} attempt
                              {question.answerCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Edit question"
                          onClick={() => {
                            setEditing(toFormValues(question));
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={question.isActive ? "Deactivate" : "Activate"}
                          disabled={busyId === question.id}
                          onClick={() => toggleActive(question)}
                        >
                          <Power />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete question"
                          onClick={() => setDeleting(question)}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="ml-9 mt-3 space-y-2 border-t border-border pt-3">
                        <ul className="space-y-1.5">
                          {question.options.map((option) => (
                            <li
                              key={option.id}
                              className={cn(
                                "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                                option.isCorrect
                                  ? "bg-success/10 text-foreground"
                                  : "text-muted-foreground"
                              )}
                            >
                              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                                {option.isCorrect && <Check className="h-4 w-4 text-success" />}
                              </span>
                              <span>{option.text}</span>
                            </li>
                          ))}
                        </ul>

                        {question.explanation && (
                          <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                            <span className="font-medium">Explanation: </span>
                            <span className="text-muted-foreground">{question.explanation}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <QuestionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        subjectId={subjectId}
        topics={topics}
        question={editing}
      />

      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} subjectId={subjectId} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this question?"
        description={
          deleting?.answerCount
            ? "Students have already answered this question, so deleting it would break their past results. Deactivate it instead."
            : "This permanently removes the question and its options. This cannot be undone."
        }
        confirmLabel="Delete question"
        loading={busyId === deleting?.id}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
