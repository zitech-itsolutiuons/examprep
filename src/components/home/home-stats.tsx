import type { ResolvedStat } from "@/server/services/home";

/**
 * The figures band under the hero.
 *
 * `tabular-nums` keeps the columns from shifting width between renders, since several of
 * these are counted live from the database on every request.
 */
export function HomeStats({ stats }: { stats: ResolvedStat[] }) {
  if (stats.length === 0) return null;

  return (
    <section className="border-b border-border bg-muted/30">
      <dl className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:divide-x lg:divide-border">
        {stats.map((stat) => (
          <div key={stat.id} className="text-center lg:px-4">
            <dd className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
              {stat.value}
            </dd>
            <dt className="mt-1.5 text-sm text-muted-foreground">{stat.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
