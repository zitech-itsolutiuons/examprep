"use client";

import { Flag } from "lucide-react";

import { cn } from "@/lib/utils";

export type PaletteEntry = {
  questionId: string;
  answered: boolean;
  skipped: boolean;
  flagged: boolean;
};

/**
 * Numbered grid navigator — the "question palette" of a CBT interface.
 *
 * Each cell encodes state twice: by colour and by an explicit `aria-label`, so the
 * status is available without relying on colour alone.
 */
export function QuestionPalette({
  entries,
  current,
  onJump,
  className,
}: {
  entries: PaletteEntry[];
  current: number;
  onJump: (index: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-6">
        {entries.map((entry, index) => {
          const isCurrent = index === current;
          const state = entry.answered ? "answered" : entry.skipped ? "skipped" : "untouched";

          return (
            <button
              key={entry.questionId}
              type="button"
              onClick={() => onJump(index)}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={`Question ${index + 1}: ${state}${entry.flagged ? ", flagged" : ""}`}
              className={cn(
                "relative flex h-9 items-center justify-center rounded-md border text-xs font-medium tabular-nums transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                entry.answered
                  ? "border-success/40 bg-success/15 text-success hover:bg-success/25"
                  : entry.skipped
                    ? "border-warning/40 bg-warning/15 text-warning-foreground hover:bg-warning/25 dark:text-warning"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                isCurrent && "ring-2 ring-primary ring-offset-1 ring-offset-background"
              )}
            >
              {index + 1}
              {entry.flagged && (
                <Flag
                  className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 fill-current text-primary"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-success/40 bg-success/25" />
          Answered
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-warning/40 bg-warning/25" />
          Skipped
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-border bg-card" />
          Not seen
        </li>
        <li className="flex items-center gap-1.5">
          <Flag className="h-2.5 w-2.5 fill-current text-primary" aria-hidden />
          Flagged
        </li>
      </ul>
    </div>
  );
}
