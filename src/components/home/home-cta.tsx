import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function HomeCta({
  title,
  body,
  buttonLabel,
  buttonHref,
}: {
  title: string;
  body: string | null;
  buttonLabel: string;
  buttonHref: string;
}) {
  return (
    <section className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="relative isolate overflow-hidden rounded-2xl border border-border bg-muted/40 px-6 py-14 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,hsl(var(--primary)/0.14),transparent_70%)]"
          />
          <h2 className="mx-auto max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h2>
          {body && (
            <p className="mx-auto mt-3 max-w-lg text-pretty text-muted-foreground">{body}</p>
          )}
          <Button size="lg" className="mt-8" asChild>
            <Link href={buttonHref}>
              {buttonLabel}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
