import { ChevronDown } from "lucide-react";

import { SectionHeading } from "@/components/home/section-heading";

type Faq = { id: string; title: string; body: string | null };

/**
 * Built on `<details>` rather than a Radix accordion: it needs no client JavaScript, stays
 * keyboard- and screen-reader-accessible for free, and the answers are in the HTML for
 * crawlers even while collapsed.
 */
export function HomeFaq({
  title,
  subtitle,
  faqs,
}: {
  title: string;
  subtitle: string | null;
  faqs: Faq[];
}) {
  if (faqs.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <SectionHeading title={title} subtitle={subtitle} />

      <div className="mt-10 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {faqs.map((faq) => (
          <details key={faq.id} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              {faq.title}
              <ChevronDown
                aria-hidden
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            {faq.body && (
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.body}</p>
            )}
          </details>
        ))}
      </div>
    </section>
  );
}
