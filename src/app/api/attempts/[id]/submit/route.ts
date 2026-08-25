import { NextResponse } from "next/server";

import { notFound } from "@/lib/api";
import { requireApiUser } from "@/lib/rbac";
import { loadOwnedAttempt } from "@/server/services/attempts";
import { AttemptNotGradableError, gradeAndSubmitAttempt } from "@/server/services/grading";

type Params = { params: { id: string } };

/**
 * Submits an attempt and grades it on the server.
 *
 * The request body is ignored entirely: the score is computed from the `UserAnswer`
 * rows already stored for this attempt, so a client cannot submit its own answers,
 * its own marking, or its own score. Ownership is verified first, and a second submit
 * of the same attempt is refused rather than re-graded.
 */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const attempt = await loadOwnedAttempt(params.id, auth.user.id);
  if (!attempt) return notFound("Attempt");

  if (attempt.status !== "IN_PROGRESS") {
    return NextResponse.json(
      {
        error: "This attempt has already been submitted.",
        attemptId: attempt.id,
        alreadySubmitted: true,
      },
      { status: 409 }
    );
  }

  // `auto=1` marks a submit triggered by the countdown reaching zero rather than by
  // the student. Either way the server re-derives the real elapsed time.
  const autoSubmitted = new URL(req.url).searchParams.get("auto") === "1";

  try {
    const result = await gradeAndSubmitAttempt(attempt.id, { autoSubmitted });
    return NextResponse.json({ attemptId: attempt.id, result });
  } catch (error) {
    if (error instanceof AttemptNotGradableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
