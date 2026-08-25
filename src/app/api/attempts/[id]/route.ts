import { NextResponse } from "next/server";

import { notFound } from "@/lib/api";
import { requireApiUser } from "@/lib/rbac";
import { loadExamState, loadOwnedAttempt } from "@/server/services/attempts";

type Params = { params: { id: string } };

/**
 * Current runner state for an in-progress attempt. Used by the exam client to
 * re-sync after a reload or a lost connection — the server's copy is authoritative,
 * including the remaining time.
 */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const state = await loadExamState(params.id, auth.user.id);
  if (state) return NextResponse.json({ state });

  // Distinguish "already submitted" from "not yours / doesn't exist" — but only for
  // attempts this user owns, so the lookup still can't be used to probe other students'.
  const attempt = await loadOwnedAttempt(params.id, auth.user.id);
  if (!attempt) return notFound("Attempt");

  return NextResponse.json(
    { error: "This attempt has already been submitted.", status: attempt.status },
    { status: 409 }
  );
}
