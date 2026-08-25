"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

function label(msLeft: number) {
  if (msLeft <= 0) return "expired";
  const minutes = Math.floor(msLeft / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${hours} hour${hours === 1 ? "" : "s"} left`
    : `${hours}h ${rest}m left`;
}

/**
 * Standing reminder that a guest session is temporary.
 *
 * Ticks once a minute rather than once a second — the number is a heads-up, not a countdown
 * to act on, and the exam runner already has its own per-second timer. Rendered client-side
 * because the remaining time depends on the viewer's clock at read time, not at build time.
 */
export function GuestSessionNotice({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const remaining = expiresAt - now;

  return (
    <Alert className="mb-6">
      <Clock />
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          You&rsquo;re practising as a guest &mdash;{" "}
          <span className="font-medium text-foreground">{label(remaining)}</span>. You&rsquo;ll
          lose access to your results when this session ends.
        </span>
        <Button size="sm" variant="outline" className="shrink-0" asChild>
          <Link href="/register">
            <UserPlus />
            Create an account
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
