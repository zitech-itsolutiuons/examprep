import { requireUser } from "@/lib/rbac";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Shell for the student area.
 *
 * `requireUser` rather than `requireAccount`: guests legitimately reach `/subjects` and
 * `/results` inside this group. The pages that need a real account use `requireAccount`
 * themselves, and middleware already refuses those paths for a guest token.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isGuest = user.role === "GUEST";

  return (
    <AppShell
      context={isGuest ? "guest" : "student"}
      user={{
        name: user.name ?? (isGuest ? "Guest" : "Student"),
        email: user.email ?? "",
        role: user.role,
      }}
      guestExpiresAt={isGuest ? user.guestExpiresAt : undefined}
    >
      {children}
    </AppShell>
  );
}
