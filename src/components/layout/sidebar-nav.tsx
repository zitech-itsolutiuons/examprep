"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { isNavItemActive, navFor, type NavContext } from "@/components/layout/nav-items";

/**
 * Vertical navigation list. Shared by the desktop sidebar and the mobile sheet.
 *
 * Takes a `context` rather than the nav groups themselves — the items carry Lucide icon
 * components, and functions can't be passed from a server component to a client one.
 */
export function SidebarNav({
  context,
  onNavigate,
  className,
}: {
  context: NavContext;
  /** Called after a link is clicked — used to close the mobile sheet. */
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const groups = navFor(context);

  return (
    <nav className={cn("flex flex-col gap-6", className)}>
      {groups.map((group, index) => (
        <div key={group.label ?? index} className="space-y-1">
          {group.label && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
