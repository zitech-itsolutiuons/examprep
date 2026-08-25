import Link from "next/link";

type FooterLink = { id: string; title: string; href: string | null };

export function HomeFooter({
  tagline,
  brandLabel,
  links,
}: {
  tagline: string | null;
  brandLabel: string;
  links: FooterLink[];
}) {
  const visibleLinks = links.filter((link) => !!link.href);

  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
        <div className="flex flex-col gap-1 text-center sm:text-left">
          <span className="font-medium text-foreground">{brandLabel}</span>
          {tagline && <span className="text-xs">{tagline}</span>}
        </div>

        {visibleLinks.length > 0 && (
          <nav aria-label="Footer links">
            <ul className="flex items-center gap-5">
              {visibleLinks.map((link) => (
                <li key={link.id}>
                  <Link href={link.href!} className="hover:text-foreground transition-colors">
                    {link.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </footer>
  );
}
