import { requireAdmin } from "@/lib/rbac";
import { loadGuestAccessSummary } from "@/server/services/guest-access";
import { PageHeader } from "@/components/layout/page-header";
import {
  GuestAccessManager,
  type GuestAccessRow,
} from "@/components/admin/guest-access-manager";

export const metadata = { title: "Guest access" };

export default async function AdminGuestAccessPage() {
  await requireAdmin();

  const summary = await loadGuestAccessSummary();

  // Dates are serialised for the client component, which formats them against the viewer's
  // locale and clock rather than the server's.
  const row: GuestAccessRow = {
    ...summary,
    issuedAt: summary.issuedAt.toISOString(),
    expiresAt: summary.expiresAt.toISOString(),
    lastPurgeAt: summary.lastPurgeAt?.toISOString() ?? null,
  };

  return (
    <div>
      <PageHeader
        title="Guest access"
        description="Let people practise without an account using a code that rotates every 12 hours."
      />
      <GuestAccessManager summary={row} />
    </div>
  );
}
