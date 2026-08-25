import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";

/**
 * Entry point for people who were handed a code rather than told to sign up.
 *
 * Sits directly under the hero, because someone arriving with a code is looking for the door,
 * not for the pitch. Rendered only while an admin has guest access switched on.
 */
export function HomeGuestBanner() {
  return (
    <section className="border-b border-border bg-primary/5">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-6 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <KeyRound className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="font-semibold tracking-tight">Been given an access code?</p>
            <p className="text-sm text-muted-foreground">
              Sit a full timed exam without creating an account.
            </p>
          </div>
        </div>

        <Link
          href="/access"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
        >
          Enter your code
          <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
