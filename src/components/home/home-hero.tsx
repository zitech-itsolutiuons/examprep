import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  badge: string | null;
  title: string;
  subtitle: string | null;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string | null;
  secondaryHref: string | null;
};

export function HomeHero({
  badge,
  title,
  subtitle,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: Props) {
  // The second button is dropped entirely when either half is blank, so clearing the label
  // in the editor removes the button rather than rendering an empty one.
  const showSecondary = !!secondaryLabel && !!secondaryHref;

  return (
    <section className="relative isolate overflow-hidden border-b border-border">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,hsl(var(--primary)/0.15),transparent_70%)]" />
        {/* Faint grid, faded out towards the edges so it never competes with the copy. */}
        <div
          className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_65%_55%_at_50%_0%,black,transparent)]"
        />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        {badge && <Badge className="mb-6">{badge}</Badge>}

        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>

        {subtitle && (
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            {subtitle}
          </p>
        )}

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href={primaryHref}>
              {primaryLabel}
              <ArrowRight />
            </Link>
          </Button>
          {showSecondary && (
            <Button size="lg" variant="outline" asChild>
              <Link href={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
