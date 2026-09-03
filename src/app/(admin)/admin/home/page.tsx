import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { requireAdmin } from "@/lib/rbac";
import { loadHomeAdmin } from "@/server/services/home";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  HomeContentManager,
  type HomeSettingsRow,
} from "@/components/admin/home-content-manager";
import type { HomeBlockRow, HomeBlockKindName } from "@/components/admin/home-block-manager";

export const metadata = { title: "Home page" };

export default async function AdminHomePage() {
  await requireAdmin();

  const { settings, blocks, updatedAt, updatedByName, metrics } = await loadHomeAdmin();

  // Mapped to plain rows rather than passed straight through: client components in this
  // codebase declare their own shapes instead of importing the domain model types.
  const toRow = (block: (typeof blocks)[HomeBlockKindName][number]): HomeBlockRow => ({
    id: block.id,
    title: block.title,
    body: block.body,
    icon: block.icon,
    metric: block.metric,
    value: block.value,
    href: block.href,
    isActive: block.isActive,
  });

  return (
    <div>
      <PageHeader
        title="Home page"
        description={
          updatedAt
            ? `Last edited ${formatDistanceToNow(updatedAt, { addSuffix: true })}${
                updatedByName ? ` by ${updatedByName}` : ""
              }. Changes go live immediately.`
            : "Editing this replaces the wording the site ships with. Changes go live immediately."
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            {/* `?preview` keeps the signed-in-admin redirect from bouncing straight back. */}
            <Link href="/?preview" target="_blank" rel="noopener">
              <ExternalLink />
              View home page
            </Link>
          </Button>
        }
      />

      <HomeContentManager
        settings={settings as HomeSettingsRow}
        blocks={{
          STAT: blocks.STAT.map(toRow),
          FEATURE: blocks.FEATURE.map(toRow),
          STEP: blocks.STEP.map(toRow),
          FAQ: blocks.FAQ.map(toRow),
          LINK: blocks.LINK.map(toRow),
        }}
        metrics={metrics}
      />
    </div>
  );
}
