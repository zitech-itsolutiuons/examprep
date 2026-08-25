import { homeIcon } from "@/lib/home-icons";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/home/section-heading";

type Feature = { id: string; title: string; body: string | null; icon: string | null };

export function HomeFeatures({
  title,
  subtitle,
  features,
}: {
  title: string;
  subtitle: string | null;
  features: Feature[];
}) {
  if (features.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <SectionHeading title={title} subtitle={subtitle} />

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = homeIcon(feature.icon);

          return (
            <Card key={feature.id} className="h-full transition-colors hover:border-primary/40">
              <CardContent className="pt-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="mt-4 font-semibold tracking-tight">{feature.title}</h3>
                {feature.body && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.body}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
