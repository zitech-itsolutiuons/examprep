"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  Loader2,
  SkipForward,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ExamTimer } from "@/components/exam/exam-timer";
import { QuestionPalette, type PaletteEntry } from "@/components/exam/question-palette";

export type RunnerQuestion = {
  id: string;
  text: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  points: number;
  topicName: string | null;
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  isSkipped: boolean;
  isFlagged: boolean;
};

export type RunnerProps = {
  attemptId: string;
  attemptNumber: number;
  subject: { slug: string; title: string; durationMin: number };
  secondsRemaining: number;
  questions: RunnerQuestion[];
  /** Where the wordmark points — a guest has no dashboard to go back to. */
  homeHref?: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const LETTERS = "ABCDEFGH";

/**
 * CBT exam runner.
 *
 * Selections are held in local state for instant feedback and pushed to the server in
 * the background; the server's copy is what gets graded, so a lost request is surfaced
 * as a visible "Not saved" state rather than silently accepted. No correctness data
 * exists in this component — the payload it receives contains option text only.
 */
export function ExamRunner({
  attemptId,
  attemptNumber,
  subject,
  secondsRemaining,
  questions,
  homeHref = "/dashboard",
}: RunnerProps) {
  const router = useRouter();

  const [current, setCurrent] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string[]>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.selectedOptionIds]))
  );
  const [skipped, setSkipped] = React.useState<Set<string>>(
    () => new Set(questions.filter((q) => q.isSkipped).map((q) => q.id))
  );
  const [flagged, setFlagged] = React.useState<Set<string>>(
    () => new Set(questions.filter((q) => q.isFlagged).map((q) => q.id))
  );
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const question = questions[current];
  const total = questions.length;

  const answeredCount = React.useMemo(
    () => questions.filter((q) => (answers[q.id]?.length ?? 0) > 0).length,
    [questions, answers]
  );
  const unansweredCount = total - answeredCount;
  const flaggedCount = flagged.size;

  // A submit in flight must not be interrupted by the timer firing a second one.
  const submittingRef = React.useRef(false);

  const submit = React.useCallback(
    async (auto: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);

      const res = await fetch(`/api/attempts/${attemptId}/submit${auto ? "?auto=1" : ""}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      // A 409 means the attempt was already submitted (double-click, or the timer
      // beating a manual submit) — the result exists, so show it rather than error.
      if (!res.ok && !data.alreadySubmitted) {
        submittingRef.current = false;
        setSubmitting(false);
        setConfirmOpen(false);
        toast.error(data.error ?? "Could not submit this attempt.");
        return;
      }

      if (auto) toast.info("Time is up — your attempt was submitted automatically.");
      router.replace(`/results/${attemptId}`);
    },
    [attemptId, router]
  );

  /** Pushes one question's complete selection to the server. */
  const persist = React.useCallback(
    async (questionId: string, selectedOptionIds: string[], isSkipped: boolean) => {
      setSaveState("saving");

      const res = await fetch(`/api/attempts/${attemptId}/answers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, selectedOptionIds, isSkipped }),
      }).catch(() => null);

      if (!res || !res.ok) {
        setSaveState("error");
        const data = await res?.json().catch(() => ({}));
        if (data?.expired) {
          void submit(true);
          return;
        }
        toast.error(data?.error ?? "That answer didn't save. Check your connection.");
        return;
      }

      setSaveState("saved");
    },
    [attemptId, submit]
  );

  function select(optionId: string) {
    const isMulti = question.type === "MULTIPLE_CHOICE";
    const currentIds = answers[question.id] ?? [];

    const next = isMulti
      ? currentIds.includes(optionId)
        ? currentIds.filter((id) => id !== optionId)
        : [...currentIds, optionId]
      : currentIds[0] === optionId
        ? [] // tapping the chosen option again clears it
        : [optionId];

    setAnswers((prev) => ({ ...prev, [question.id]: next }));

    if (next.length > 0) {
      setSkipped((prev) => {
        if (!prev.has(question.id)) return prev;
        const updated = new Set(prev);
        updated.delete(question.id);
        return updated;
      });
    }

    void persist(question.id, next, false);
  }

  function skip() {
    setAnswers((prev) => ({ ...prev, [question.id]: [] }));
    setSkipped((prev) => new Set(prev).add(question.id));
    void persist(question.id, [], true);
    goTo(current + 1);
  }

  async function toggleFlag() {
    const nowFlagged = !flagged.has(question.id);

    setFlagged((prev) => {
      const updated = new Set(prev);
      if (nowFlagged) updated.add(question.id);
      else updated.delete(question.id);
      return updated;
    });

    const res = await fetch(`/api/attempts/${attemptId}/flags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, flagged: nowFlagged }),
    }).catch(() => null);

    if (!res || !res.ok) {
      // Roll the optimistic toggle back so the palette can't claim a flag the server
      // never recorded.
      setFlagged((prev) => {
        const updated = new Set(prev);
        if (nowFlagged) updated.delete(question.id);
        else updated.add(question.id);
        return updated;
      });
      toast.error("Could not update the flag.");
    }
  }

  const goTo = React.useCallback(
    (index: number) => {
      setCurrent(Math.max(0, Math.min(questions.length - 1, index)));
      setPaletteOpen(false);
    },
    [questions.length]
  );

  // Warn on tab close / refresh while the attempt is live, so an accidental close
  // doesn't feel like lost work.
  React.useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (submittingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Arrow-key navigation, ignored while typing in a field or with a dialog open.
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (confirmOpen) return;

      if (event.key === "ArrowRight") goTo(current + 1);
      if (event.key === "ArrowLeft") goTo(current - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, goTo, confirmOpen]);

  const paletteEntries: PaletteEntry[] = questions.map((q) => ({
    questionId: q.id,
    answered: (answers[q.id]?.length ?? 0) > 0,
    skipped: skipped.has(q.id) && (answers[q.id]?.length ?? 0) === 0,
    flagged: flagged.has(q.id),
  }));

  const selectedIds = answers[question.id] ?? [];
  const progressValue = total > 0 ? (answeredCount / total) * 100 : 0;

  const paletteAside = (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Progress</span>
          <span className="tabular-nums text-muted-foreground">
            {answeredCount}/{total}
          </span>
        </div>
        <Progress value={progressValue} indicatorClassName="bg-success" />
      </div>

      <QuestionPalette entries={paletteEntries} current={current} onJump={goTo} />

      <Button className="w-full" onClick={() => setConfirmOpen(true)} disabled={submitting}>
        Submit exam
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <div className="hidden sm:block">
            <Brand href={homeHref} />
          </div>

          <div className="min-w-0 flex-1 sm:border-l sm:border-border sm:pl-3">
            <p className="truncate text-sm font-medium">{subject.title}</p>
            <p className="text-xs text-muted-foreground">Attempt #{attemptNumber}</p>
          </div>

          <SaveIndicator state={saveState} />

          <ExamTimer initialSeconds={secondsRemaining} onExpire={() => void submit(true)} />

          <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="lg:hidden">
                {current + 1}/{total}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[19rem] overflow-y-auto">
              <SheetTitle className="mb-5">Questions</SheetTitle>
              {paletteAside}
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <main className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Question {current + 1} of {total}
            </span>
            {question.topicName && <Badge variant="outline">{question.topicName}</Badge>}
            <Badge variant="secondary">
              {question.points} {question.points === 1 ? "point" : "points"}
            </Badge>
            {question.type === "MULTIPLE_CHOICE" && (
              <Badge variant="warning">Select all that apply</Badge>
            )}
            {flagged.has(question.id) && (
              <Badge variant="default">
                <Flag className="fill-current" />
                Flagged
              </Badge>
            )}
          </div>

          <Card>
            <CardContent className="space-y-6 p-5 sm:p-6">
              <p className="text-base leading-relaxed sm:text-lg">{question.text}</p>

              <div
                role={question.type === "MULTIPLE_CHOICE" ? "group" : "radiogroup"}
                aria-label="Answer options"
                className="space-y-2.5"
              >
                {question.options.map((option, index) => {
                  const isSelected = selectedIds.includes(option.id);
                  const isMulti = question.type === "MULTIPLE_CHOICE";

                  return (
                    <button
                      key={option.id}
                      type="button"
                      role={isMulti ? "checkbox" : "radio"}
                      aria-checked={isSelected}
                      onClick={() => select(option.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-3.5 text-left text-sm transition-colors sm:p-4",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-input hover:bg-accent/50"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-semibold transition-colors",
                          isMulti ? "rounded-md" : "rounded-full",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input text-muted-foreground"
                        )}
                        aria-hidden
                      >
                        {isSelected && isMulti ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          LETTERS[index] ?? index + 1
                        )}
                      </span>
                      <span className="pt-0.5 leading-relaxed">{option.text}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleFlag}
                  aria-pressed={flagged.has(question.id)}
                >
                  <Flag className={cn(flagged.has(question.id) && "fill-current text-primary")} />
                  {flagged.has(question.id) ? "Unflag" : "Flag for review"}
                </Button>

                <Button variant="ghost" size="sm" onClick={skip}>
                  <SkipForward />
                  Skip
                </Button>

                {selectedIds.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAnswers((prev) => ({ ...prev, [question.id]: [] }));
                      void persist(question.id, [], false);
                    }}
                  >
                    <X />
                    Clear selection
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => goTo(current - 1)} disabled={current === 0}>
              <ChevronLeft />
              Previous
            </Button>

            {current === total - 1 ? (
              <Button onClick={() => setConfirmOpen(true)} disabled={submitting}>
                Review &amp; submit
              </Button>
            ) : (
              <Button onClick={() => goTo(current + 1)}>
                Next
                <ChevronRight />
              </Button>
            )}
          </div>
        </main>

        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20 rounded-xl border border-border bg-card p-4">
            {paletteAside}
          </div>
        </aside>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this attempt?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Your answers will be marked on the server and the result becomes final —
                  a submitted attempt can&apos;t be edited.
                </p>
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-border p-3 text-center">
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-success">
                      {answeredCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Answered</p>
                  </div>
                  <div>
                    <p
                      className={cn(
                        "text-lg font-semibold tabular-nums",
                        unansweredCount > 0 && "text-destructive"
                      )}
                    >
                      {unansweredCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Unanswered</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{flaggedCount}</p>
                    <p className="text-xs text-muted-foreground">Flagged</p>
                  </div>
                </div>
                {unansweredCount > 0 && (
                  <p className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {unansweredCount} question{unansweredCount === 1 ? "" : "s"} will be marked
                    as unanswered and score zero.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Keep working</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                void submit(false);
              }}
            >
              {submitting ? "Submitting…" : "Submit exam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Autosave status, so a failed write is visible instead of silent. */
function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;

  const content = {
    saving: { icon: <Loader2 className="h-3 w-3 animate-spin" />, text: "Saving…", tone: "text-muted-foreground" },
    saved: { icon: <Check className="h-3 w-3" />, text: "Saved", tone: "text-success" },
    error: { icon: <AlertTriangle className="h-3 w-3" />, text: "Not saved", tone: "text-destructive" },
  }[state];

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("hidden items-center gap-1.5 text-xs font-medium sm:inline-flex", content.tone)}
    >
      {content.icon}
      {content.text}
    </span>
  );
}
