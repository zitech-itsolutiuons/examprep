"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

function format(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Countdown for the current attempt.
 *
 * The starting value comes from the server (`secondsRemaining`), and a deadline is
 * derived from it on mount — so a client clock that's wrong by hours doesn't change the
 * exam length. This display is a courtesy; the server rejects late saves regardless.
 */
export function ExamTimer({
  initialSeconds,
  onExpire,
}: {
  initialSeconds: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = React.useState(initialSeconds);
  const deadlineRef = React.useRef<number | null>(null);
  const firedRef = React.useRef(false);

  // Keep the callback in a ref so re-renders of the parent don't restart the interval.
  const expireRef = React.useRef(onExpire);
  expireRef.current = onExpire;

  React.useEffect(() => {
    deadlineRef.current = Date.now() + initialSeconds * 1000;

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadlineRef.current! - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        expireRef.current();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [initialSeconds]);

  const critical = remaining <= 60;
  const low = remaining <= 300;

  return (
    <div
      role="timer"
      aria-live={critical ? "assertive" : "off"}
      aria-label={`Time remaining: ${format(remaining)}`}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-semibold tabular-nums transition-colors",
        critical
          ? "animate-pulse border-destructive/40 bg-destructive/10 text-destructive"
          : low
            ? "border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning"
            : "border-border bg-card text-foreground"
      )}
    >
      <Clock className="h-4 w-4 shrink-0" aria-hidden />
      {format(remaining)}
    </div>
  );
}
