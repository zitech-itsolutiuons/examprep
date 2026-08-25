import Link from "next/link";
import { BookOpen, CheckCircle2, Clock, History, TrendingUp } from "lucide-react";

import { requireAccount } from "@/lib/rbac";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { HistoryTable } from "@/components/student/history-table";
import { getAttemptHistory } from "@/server/services/progress";

export const metadata = { title: "History" };
export const dynamic = "force-dynamic";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export default async function HistoryPage() {
  const user = await requireAccount();

  // Scoped to the session user — a student's history query has no other input.
  const attempts = await getAttemptHistory(user.id);

  const submitted = attempts.filter((attempt) => attempt.status === "SUBMITTED");
  const passed = submitted.filter((attempt) => attempt.passed).length;
  const totalSeconds = submitted.reduce((sum, attempt) => sum + (attempt.timeSpentSec ?? 0), 0);
  const best =
    submitted.length > 0 ? Math.max(...submitted.map((a) => a.percentage ?? 0)) : null;

  return (
    <div>
      <PageHeader
        title="Attempt history"
        description="Every exam you've sat. Retakes are kept alongside earlier attempts, never in place of them."
        actions={
          <Button asChild variant="outline">
            <Link href="/subjects">
              <BookOpen />
              Browse subjects
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        {submitted.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Attempts completed" value={submitted.length} icon={History} />
            <StatCard
              label="Passed"
              value={passed}
              hint={`${((passed / submitted.length) * 100).toFixed(0)}% pass rate`}
              icon={CheckCircle2}
            />
            <StatCard
              label="Best score"
              value={best === null ? "—" : `${best.toFixed(1)}%`}
              icon={TrendingUp}
            />
            <StatCard
              label="Time in exams"
              value={formatDuration(totalSeconds)}
              hint="Across all submitted attempts"
              icon={Clock}
            />
          </div>
        )}

        <HistoryTable attempts={attempts} />
      </div>
    </div>
  );
}
