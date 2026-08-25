"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, History, Search, Timer } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AttemptHistoryRow } from "@/server/services/progress";

const ALL = "__all__";

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Full attempt history with client-side filtering.
 *
 * Filtering is local because a student's own history is a bounded list — the server
 * already sent exactly their rows, so there's nothing to page through or re-fetch.
 */
export function HistoryTable({ attempts }: { attempts: AttemptHistoryRow[] }) {
  const [subjectFilter, setSubjectFilter] = React.useState(ALL);
  const [outcomeFilter, setOutcomeFilter] = React.useState(ALL);

  const subjects = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const attempt of attempts) map.set(attempt.subjectId, attempt.subjectTitle);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [attempts]);

  const filtered = React.useMemo(
    () =>
      attempts.filter((attempt) => {
        if (subjectFilter !== ALL && attempt.subjectId !== subjectFilter) return false;
        if (outcomeFilter === "passed" && attempt.passed !== true) return false;
        if (outcomeFilter === "failed" && attempt.passed !== false) return false;
        if (outcomeFilter === "in-progress" && attempt.status !== "IN_PROGRESS") return false;
        return true;
      }),
    [attempts, subjectFilter, outcomeFilter]
  );

  if (attempts.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No attempts yet"
        description="Sit your first exam and every attempt will be listed here — scores, timing, and a link back to the full review."
        action={
          <Button asChild>
            <Link href="/subjects">Browse subjects</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="All subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All subjects</SelectItem>
            {subjects.map(([id, title]) => (
              <SelectItem key={id} value={id}>
                {title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="All outcomes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All outcomes</SelectItem>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="failed">Below pass mark</SelectItem>
            <SelectItem value="in-progress">In progress</SelectItem>
          </SelectContent>
        </Select>

        <p className="flex items-center text-sm text-muted-foreground sm:ml-auto">
          {filtered.length} of {attempts.length} attempt{attempts.length === 1 ? "" : "s"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nothing matches these filters"
          description="Try a different subject or outcome."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="w-20 text-center">Attempt</TableHead>
                <TableHead className="w-24 text-right">Score</TableHead>
                <TableHead className="w-32 text-center">Breakdown</TableHead>
                <TableHead className="w-24 text-right">Time</TableHead>
                <TableHead className="w-44">Date</TableHead>
                <TableHead className="w-24 text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((attempt) => {
                const pending = attempt.status === "IN_PROGRESS";

                return (
                  <TableRow key={attempt.attemptId}>
                    <TableCell>
                      <div className="space-y-1">
                        <Link
                          href={`/subjects/${attempt.subjectSlug}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {attempt.subjectTitle}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {pending ? (
                            <Badge variant="warning">In progress</Badge>
                          ) : (
                            <Badge variant={attempt.passed ? "success" : "destructive"}>
                              {attempt.passed ? "Passed" : "Below pass"}
                            </Badge>
                          )}
                          {attempt.isAutoSubmitted && (
                            <Badge variant="outline">
                              <Timer />
                              Time up
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-center text-sm tabular-nums text-muted-foreground">
                      #{attempt.attemptNumber}
                    </TableCell>

                    <TableCell className="text-right">
                      {pending ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <div>
                          <p
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              attempt.passed ? "text-success" : "text-destructive"
                            )}
                          >
                            {(attempt.percentage ?? 0).toFixed(1)}%
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {attempt.score}/{attempt.totalPoints}
                          </p>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      {pending ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <span className="text-xs tabular-nums">
                          <span className="text-success">{attempt.correctCount}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span className="text-destructive">{attempt.incorrectCount}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span className="text-muted-foreground">
                            {attempt.unansweredCount}
                          </span>
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      {formatDuration(attempt.timeSpentSec)}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(attempt.submittedAt ?? attempt.startedAt)}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={
                            pending
                              ? `/exam/${attempt.attemptId}`
                              : `/results/${attempt.attemptId}`
                          }
                        >
                          {pending ? "Resume" : "Review"}
                          <ArrowRight />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Breakdown reads correct · wrong · unanswered.
      </p>
    </div>
  );
}
