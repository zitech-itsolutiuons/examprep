"use client";

import * as React from "react";
import { Check, CircleSlash, Flag, Lightbulb, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { ReviewOutcome, ReviewQuestion } from "@/server/services/results";

type Filter = "all" | "mistakes" | "incorrect" | "unanswered" | "correct" | "flagged";

const OUTCOME_META: Record<
  ReviewOutcome,
  { label: string; badge: "success" | "destructive" | "warning"; accent: string }
> = {
  CORRECT: { label: "Correct", badge: "success", accent: "border-l-success" },
  INCORRECT: { label: "Incorrect", badge: "destructive", accent: "border-l-destructive" },
  UNANSWERED: { label: "Unanswered", badge: "warning", accent: "border-l-warning" },
};

const LETTERS = "ABCDEFGH";

/**
 * Per-question review with the mistake filter.
 *
 * Every question shows what the student picked, what was correct, and — when they got it
 * wrong or left it blank — the admin's explanation, which is the correction system.
 */
export function ResultsReview({ questions }: { questions: ReviewQuestion[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const counts = React.useMemo(() => {
    const base = { correct: 0, incorrect: 0, unanswered: 0, flagged: 0 };
    for (const question of questions) {
      if (question.outcome === "CORRECT") base.correct += 1;
      if (question.outcome === "INCORRECT") base.incorrect += 1;
      if (question.outcome === "UNANSWERED") base.unanswered += 1;
      if (question.isFlagged) base.flagged += 1;
    }
    return base;
  }, [questions]);

  const filtered = React.useMemo(() => {
    switch (filter) {
      case "mistakes":
        return questions.filter((q) => q.outcome !== "CORRECT");
      case "incorrect":
        return questions.filter((q) => q.outcome === "INCORRECT");
      case "unanswered":
        return questions.filter((q) => q.outcome === "UNANSWERED");
      case "correct":
        return questions.filter((q) => q.outcome === "CORRECT");
      case "flagged":
        return questions.filter((q) => q.isFlagged);
      default:
        return questions;
    }
  }, [questions, filter]);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: questions.length },
    { key: "mistakes", label: "Mistakes only", count: counts.incorrect + counts.unanswered },
    { key: "incorrect", label: "Wrong", count: counts.incorrect },
    { key: "unanswered", label: "Unanswered", count: counts.unanswered },
    { key: "correct", label: "Correct", count: counts.correct },
    { key: "flagged", label: "Flagged", count: counts.flagged },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter questions">
        {filters.map((entry) => (
          <Button
            key={entry.key}
            role="tab"
            aria-selected={filter === entry.key}
            variant={filter === entry.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(entry.key)}
          >
            {entry.label}
            <span className="tabular-nums opacity-70">{entry.count}</span>
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={filter === "mistakes" ? Check : Search}
          title={
            filter === "mistakes"
              ? "No mistakes to review"
              : "Nothing matches this filter"
          }
          description={
            filter === "mistakes"
              ? "You answered every question correctly on this attempt."
              : "Try a different filter to see the rest of your answers."
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((question) => {
            const meta = OUTCOME_META[question.outcome];
            const showExplanation = question.outcome !== "CORRECT" && !!question.explanation;

            return (
              <li key={question.id}>
                <Card className={cn("border-l-4", meta.accent)}>
                  <CardContent className="space-y-4 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                        Q{question.number}
                      </span>
                      <Badge variant={meta.badge}>
                        {question.outcome === "CORRECT" ? (
                          <Check />
                        ) : question.outcome === "INCORRECT" ? (
                          <X />
                        ) : (
                          <CircleSlash />
                        )}
                        {meta.label}
                      </Badge>
                      {question.topicName && (
                        <Badge variant="outline">{question.topicName}</Badge>
                      )}
                      {question.type === "MULTIPLE_CHOICE" && (
                        <Badge variant="secondary">Multiple answers</Badge>
                      )}
                      {question.isFlagged && (
                        <Badge variant="default">
                          <Flag className="fill-current" />
                          Flagged
                        </Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {question.outcome === "CORRECT" ? question.points : 0}/{question.points} pts
                      </span>
                    </div>

                    <p className="text-sm leading-relaxed sm:text-base">{question.text}</p>

                    <ul className="space-y-2">
                      {question.options.map((option, index) => {
                        // Four visual states: right and chosen, right but missed,
                        // chosen but wrong, and simply not chosen.
                        const state = option.isCorrect
                          ? option.isSelected
                            ? "correct-picked"
                            : "correct-missed"
                          : option.isSelected
                            ? "wrong-picked"
                            : "neutral";

                        return (
                          <li
                            key={option.id}
                            className={cn(
                              "flex items-start gap-3 rounded-lg border p-3 text-sm",
                              state === "correct-picked" &&
                                "border-success/45 bg-success/10",
                              state === "correct-missed" &&
                                "border-success/45 border-dashed bg-success/5",
                              state === "wrong-picked" &&
                                "border-destructive/45 bg-destructive/10",
                              state === "neutral" && "border-border"
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                                state === "correct-picked" &&
                                  "border-success bg-success text-success-foreground",
                                state === "correct-missed" && "border-success text-success",
                                state === "wrong-picked" &&
                                  "border-destructive bg-destructive text-destructive-foreground",
                                state === "neutral" && "border-input text-muted-foreground"
                              )}
                              aria-hidden
                            >
                              {state === "correct-picked" ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : state === "wrong-picked" ? (
                                <X className="h-3.5 w-3.5" />
                              ) : (
                                LETTERS[index] ?? index + 1
                              )}
                            </span>

                            <span className="min-w-0 flex-1 pt-0.5 leading-relaxed">
                              {option.text}
                            </span>

                            <span className="flex shrink-0 flex-wrap justify-end gap-1">
                              {option.isSelected && (
                                <Badge
                                  variant={option.isCorrect ? "success" : "destructive"}
                                  className="text-[0.65rem]"
                                >
                                  Your answer
                                </Badge>
                              )}
                              {option.isCorrect && !option.isSelected && (
                                <Badge variant="success" className="text-[0.65rem]">
                                  Correct answer
                                </Badge>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>

                    {showExplanation && (
                      <div className="flex gap-2.5 rounded-lg bg-muted/70 p-3.5 text-sm">
                        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground dark:text-warning" />
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">Correction</p>
                          <p className="leading-relaxed text-muted-foreground">
                            {question.explanation}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
