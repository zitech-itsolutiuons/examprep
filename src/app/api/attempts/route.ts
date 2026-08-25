import { NextResponse } from "next/server";

import { badRequest, readJson, validationError } from "@/lib/api";
import { requireApiUser } from "@/lib/rbac";
import { startOrResumeAttempt } from "@/server/services/attempts";
import { startAttemptSchema } from "@/server/validators/attempt";

/**
 * Starts an attempt (or resumes the student's live one for that subject).
 *
 * The attempt is always created for the *session* user — the client cannot name a
 * userId — so an attempt can never be opened on someone else's behalf.
 */
export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const parsed = startAttemptSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const result = await startOrResumeAttempt(auth.user.id, parsed.data.subjectId);

  if (!result.ok) {
    return result.reason === "NO_QUESTIONS"
      ? badRequest("This subject has no questions available yet.")
      : NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  return NextResponse.json(
    { attemptId: result.attemptId, resumed: result.resumed },
    { status: result.resumed ? 200 : 201 }
  );
}
