export function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string | null;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-3 text-pretty text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
