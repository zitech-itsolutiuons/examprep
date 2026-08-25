import { cn } from "@/lib/utils";
import type { TrendPoint } from "@/server/services/progress";

/**
 * Score-over-time chart, built from an inline SVG polyline plus absolutely-positioned
 * dots — no chart library and no client JS, matching the admin score histogram.
 *
 * The line is drawn with `preserveAspectRatio="none"` so it stretches to any width, and
 * `vector-effect="non-scaling-stroke"` keeps the stroke an even weight despite that
 * stretch. Dots are HTML rather than SVG circles so they stay round.
 *
 * Pass marks differ per subject, so there is no single pass line; each dot is instead
 * coloured against its own subject's pass mark.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) return null;

  const GRIDLINES = [100, 75, 50, 25, 0];

  // A single attempt has no line to draw, so it sits in the middle of the plot.
  const x = (index: number) =>
    points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
  const y = (percentage: number) => 100 - percentage;

  const polyline = points.map((point, index) => `${x(index)},${y(point.percentage)}`).join(" ");
  const area = `0,100 ${polyline} 100,100`;

  return (
    <figure className="space-y-3">
      <div className="relative">
        {/* Y-axis labels */}
        <div className="absolute inset-y-0 left-0 flex w-8 flex-col justify-between text-right">
          {GRIDLINES.map((value) => (
            <span key={value} className="text-[10px] leading-none text-muted-foreground tabular-nums">
              {value}
            </span>
          ))}
        </div>

        <div className="relative ml-10 h-44">
          {/* Gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {GRIDLINES.map((value) => (
              <div
                key={value}
                className={cn(
                  "h-px w-full",
                  value === 0 ? "bg-border" : "bg-border/50"
                )}
              />
            ))}
          </div>

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden
          >
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>

            {points.length > 1 && <polygon points={area} fill="url(#trend-fill)" />}

            <polyline
              points={polyline}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Dots, positioned in percentage space so they stay circular. */}
          {points.map((point, index) => (
            <span
              key={point.attemptId}
              title={`${point.subjectTitle} · attempt #${point.attemptNumber} · ${point.percentage}%`}
              className={cn(
                "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card",
                point.passed ? "bg-success" : "bg-destructive"
              )}
              style={{ left: `${x(index)}%`, top: `${y(point.percentage)}%` }}
            />
          ))}
        </div>
      </div>

      <figcaption className="ml-10 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {points.length === 1
            ? "First attempt"
            : `Oldest → newest · ${points.length} attempts`}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" />
            Passed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            Below pass
          </span>
        </span>
      </figcaption>

      {/* Screen-reader equivalent: a chart is not readable, a table is. */}
      <table className="sr-only">
        <caption>Score per attempt, oldest first</caption>
        <thead>
          <tr>
            <th scope="col">Attempt</th>
            <th scope="col">Subject</th>
            <th scope="col">Score</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.attemptId}>
              <td>#{point.attemptNumber}</td>
              <td>{point.subjectTitle}</td>
              <td>{point.percentage}%</td>
              <td>{point.passed ? "Passed" : "Below pass mark"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
