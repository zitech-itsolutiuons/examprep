import Link from "next/link";
import { KeyRound } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function HomeHeader({
  brandLabel,
  guestAccessEnabled,
}: {
  brandLabel: string;
  /** Hidden entirely when an admin has turned guest access off. */
  guestAccessEnabled: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Brand href="/" label={brandLabel} />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {guestAccessEnabled && (
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/access">
                <KeyRound />
                Have a code?
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
