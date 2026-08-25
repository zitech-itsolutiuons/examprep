import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  /** Signed percentage-point delta; renders a coloured trend chip when provided. */
  delta?: number | null;
  className?: string;
};

/** Compact KPI tile shared by the student dashboard and the admin overview. */
export function StatCard({ label, value, hint, icon: Icon, delta, className }: StatCardProps) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const up = hasDelta && delta! > 0;
  const down = hasDelta && delta! < 0;

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {hasDelta && delta !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              up && "text-success",
              down && "text-destructive"
            )}
          >
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? "+" : ""}
            {delta!.toFixed(1)}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
