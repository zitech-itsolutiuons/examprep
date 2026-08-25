import { requireAdmin } from "@/lib/rbac";
import { AppShell } from "@/components/layout/app-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <AppShell
      context="admin"
      user={{ name: user.name ?? "Admin", email: user.email ?? "", role: user.role }}
    >
      {children}
    </AppShell>
  );
}
