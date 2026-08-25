import { cn } from "@/lib/utils";
import type { ScoreBucket } from "@/server/services/analytics";

/**
 * Dependency-free score histogram. Bars are plain divs sized as a percentage of the tallest
 * bucket, so it renders on the server with no chart library and no client JS.
 */
export function ScoreDistributionChart({ buckets }: { buckets: ScoreBucket[] }) {
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  if (total === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No submitted attempts yet — the distribution appears once students start finishing exams.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex h-40 items-end gap-1.5">
        {buckets.map((bucket) => {
          const height = Math.round((bucket.count / max) * 100);
          return (
            <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {bucket.count > 0 ? bucket.count : ""}
              </span>
              <div
                className={cn(
                  "w-full rounded-t transition-all",
                  bucket.from >= 50 ? "bg-success/70" : "bg-destructive/60"
                )}
                style={{ height: `${Math.max(height, bucket.count > 0 ? 4 : 0)}%` }}
                role="img"
                aria-label={`${bucket.count} attempts scored ${bucket.label}`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-1.5">
        {buckets.map((bucket) => (
          <span
            key={bucket.label}
            className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground"
          >
            {bucket.from}
          </span>
        ))}
      </div>
    </div>
  );
}
