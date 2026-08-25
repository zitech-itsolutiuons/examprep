import { NextResponse } from "next/server";

import { badRequest, notFound, readJson, validationError } from "@/lib/api";
import { requireApiUser } from "@/lib/rbac";
import { saveAnswer, type SaveOutcome } from "@/server/services/attempts";
import { saveAnswerSchema } from "@/server/validators/attempt";

type Params = { params: { id: string } };

function failure(reason: Exclude<SaveOutcome, { ok: true }>["reason"]) {
  switch (reason) {
    case "NOT_FOUND":
      return notFound("Question");
    case "SUBMITTED":
      return NextResponse.json(
        { error: "This attempt has been submitted and can no longer be changed." },
        { status: 409 }
      );
    case "EXPIRED":
      return NextResponse.json(
        { error: "Time is up for this attempt.", expired: true },
        { status: 409 }
      );
    case "BAD_OPTION":
      return badRequest("That option does not belong to this question.");
    case "TOO_MANY":
      return badRequest("This question accepts a single answer.");
  }
}

/** Autosave endpoint. Called on every selection change, skip, and clear. */
export async function PUT(req: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const parsed = saveAnswerSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const result = await saveAnswer(params.id, auth.user.id, parsed.data);
  if (!result.ok) return failure(result.reason);

  return NextResponse.json({ saved: true });
}
