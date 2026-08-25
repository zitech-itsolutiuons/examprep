import { Brand } from "@/components/layout/brand";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { GuestSessionNotice } from "@/components/layout/guest-session-notice";
import type { NavContext } from "@/components/layout/nav-items";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";

type AppShellProps = {
  user: { name: string; email: string; role: "STUDENT" | "ADMIN" | "GUEST" };
  context: NavContext;
  /** GUEST sessions only: epoch ms the session lapses, for the countdown notice. */
  guestExpiresAt?: number;
  children: React.ReactNode;
};

const SHELL_LABEL: Record<NavContext, { text: string; variant: "warning" | "outline" | "default" }> = {
  admin: { text: "Admin access", variant: "warning" },
  student: { text: "Student", variant: "outline" },
  guest: { text: "Guest access", variant: "default" },
};

/**
 * Fixed sidebar + sticky topbar frame used by the student, admin, and guest areas.
 *
 * Server component: it only renders session data that the layout already loaded. The nav
 * itself is resolved from `context` inside the client nav components — passing the nav
 * groups down from here would mean sending Lucide icon *functions* across the
 * server→client boundary, which React rejects at render time.
 */
export function AppShell({ user, context, guestExpiresAt, children }: AppShellProps) {
  const brandHref = context === "admin" ? "/admin/dashboard" : context === "guest" ? "/subjects" : "/dashboard";
  const brandSuffix = context === "admin" ? "Admin" : context === "guest" ? "Guest" : undefined;
  const label = SHELL_LABEL[context];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-5">
          <Brand href={brandHref} suffix={brandSuffix} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav context={context} />
        </div>
        <div className="shrink-0 border-t border-border p-4">
          <Badge variant={label.variant}>{label.text}</Badge>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:px-6">
          <MobileNav context={context} brandHref={brandHref} brandSuffix={brandSuffix} />
          <div className="lg:hidden">
            <Brand href={brandHref} suffix={brandSuffix} />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu
              name={user.name}
              email={user.email}
              role={user.role}
              context={context}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {context === "guest" && guestExpiresAt !== undefined && (
            <GuestSessionNotice expiresAt={guestExpiresAt} />
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
