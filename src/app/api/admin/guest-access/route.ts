import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, readJson, validationError } from "@/lib/api";
import {
  getActiveCode,
  loadGuestAccessSummary,
  resetGuestCode,
  setGuestAccessEnabled,
  setGuestRedemptionCap,
  sweepExpiredGuests,
} from "@/server/services/guest-access";
import { writeAudit } from "@/server/services/audit";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("toggle"), isEnabled: z.boolean() }),
  z.object({
    action: z.literal("cap"),
    // Null removes the cap entirely.
    maxRedemptions: z.number().int().min(1).max(100_000).nullable(),
  }),
  z.object({ action: z.literal("purge") }),
]);

export async function GET() {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  return NextResponse.json(await loadGuestAccessSummary());
}

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const parsed = actionSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const body = parsed.data;

  switch (body.action) {
    /**
     * Hard revoke. Issues a new code AND bumps the generation, which invalidates every guest
     * token already out there — see the note on the `GuestAccessCode` model for why those are
     * two separate fields.
     */
    case "reset": {
      const before = await getActiveCode();
      const row = await resetGuestCode(auth.user.id);

      await writeAudit({
        userId: auth.user.id,
        action: "guest.code.reset",
        entity: "GuestAccessCode",
        entityId: row.id,
        metadata: {
          generation: row.generation,
          revokedGeneration: before.generation,
          redemptionsAtReset: before.redemptions,
        },
      });

      return NextResponse.json({ summary: await loadGuestAccessSummary() });
    }

    case "toggle": {
      const row = await setGuestAccessEnabled(body.isEnabled, auth.user.id);

      await writeAudit({
        userId: auth.user.id,
        action: body.isEnabled ? "guest.access.enable" : "guest.access.disable",
        entity: "GuestAccessCode",
        entityId: row.id,
      });

      return NextResponse.json({ summary: await loadGuestAccessSummary() });
    }

    case "cap": {
      const row = await setGuestRedemptionCap(body.maxRedemptions, auth.user.id);

      await writeAudit({
        userId: auth.user.id,
        action: "guest.access.cap",
        entity: "GuestAccessCode",
        entityId: row.id,
        metadata: { maxRedemptions: body.maxRedemptions },
      });

      return NextResponse.json({ summary: await loadGuestAccessSummary() });
    }

    /** Manual trigger for the retention sweep that normally rides along with the 12h roll. */
    case "purge": {
      const removed = await sweepExpiredGuests();

      await writeAudit({
        userId: auth.user.id,
        action: "guest.retention.sweep",
        entity: "User",
        metadata: { removed },
      });

      return NextResponse.json({ removed, summary: await loadGuestAccessSummary() });
    }

    default:
      return badRequest("Unknown action");
  }
}
