import { NextResponse } from "next/server";
import { z } from "zod";

import { readJson, validationError } from "@/lib/api";
import { getActiveCode, normaliseCode } from "@/server/services/guest-access";

const checkSchema = z.object({
  code: z.string().trim().min(1, "Enter the access code").max(40),
});

/**
 * Pre-flight check for the code screen.
 *
 * NextAuth's `authorize` can only answer yes/no, so it can't tell a user *why* a code was
 * refused. The form calls this first to get a specific reason, then signs in. That means a
 * wrong code costs one cheap request and never mints anything.
 *
 * Deliberately unauthenticated — this is the front door. It reveals only whether guest
 * access is on and whether a submitted code matches; it never returns the code itself.
 */
export async function POST(req: Request) {
  const parsed = checkSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const active = await getActiveCode();

  if (!active.isEnabled) {
    return NextResponse.json(
      { ok: false, reason: "disabled", error: "Guest access is turned off right now." },
      { status: 403 }
    );
  }

  if (normaliseCode(parsed.data.code) !== normaliseCode(active.code)) {
    return NextResponse.json(
      { ok: false, reason: "invalid", error: "That code isn't right, or it has expired." },
      { status: 401 }
    );
  }

  if (active.maxRedemptions !== null && active.redemptions >= active.maxRedemptions) {
    return NextResponse.json(
      {
        ok: false,
        reason: "exhausted",
        error: "This code has reached its limit. Ask for a new one.",
      },
      { status: 429 }
    );
  }

  return NextResponse.json({ ok: true });
}
