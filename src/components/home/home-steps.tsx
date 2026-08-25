import { homeIcon } from "@/lib/home-icons";
import { SectionHeading } from "@/components/home/section-heading";

type Step = { id: string; title: string; body: string | null; icon: string | null };

export function HomeSteps({
  title,
  subtitle,
  steps,
}: {
  title: string;
  subtitle: string | null;
  steps: Step[];
}) {
  if (steps.length === 0) return null;

  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading title={title} subtitle={subtitle} />

        <ol className="relative mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {/* The rule that joins the numbers, drawn only where the steps sit in one row. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-5 hidden border-t border-dashed border-border lg:block"
          />

          {steps.map((step, index) => {
            const Icon = homeIcon(step.icon);

            return (
              <li key={step.id} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold tabular-nums shadow-sm">
                    {index + 1}
                  </span>
                  <Icon className="h-4 w-4 text-primary" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold tracking-tight">{step.title}</h3>
                {step.body && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
