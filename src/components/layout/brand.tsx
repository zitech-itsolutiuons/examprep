import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { cn } from "@/lib/utils";

/** Wordmark used in the sidebar, auth screens, and the exam runner header. */
export function Brand({
  href = "/dashboard",
  label = "ExamPrep",
  suffix,
  className,
}: {
  href?: string;
  label?: string;
  suffix?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <GraduationCap className="h-4 w-4" />
      </span>
      <span className="flex items-baseline gap-1.5">
        {label}
        {suffix && (
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {suffix}
          </span>
        )}
      </span>
    </Link>
  );
}
