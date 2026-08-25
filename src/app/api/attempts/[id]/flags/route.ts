import { NextResponse } from "next/server";

import { notFound, readJson, validationError } from "@/lib/api";
import { requireApiUser } from "@/lib/rbac";
import { setFlag } from "@/server/services/attempts";
import { flagQuestionSchema } from "@/server/validators/attempt";

type Params = { params: { id: string } };

/** Flags or unflags a question for later review within an in-progress attempt. */
export async function PUT(req: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const parsed = flagQuestionSchema.safeParse(await readJson(req));
  if (!parsed.success) return validationError(parsed.error);

  const result = await setFlag(params.id, auth.user.id, parsed.data);

  if (!result.ok) {
    return result.reason === "SUBMITTED"
      ? NextResponse.json(
          { error: "This attempt has been submitted and can no longer be changed." },
          { status: 409 }
        )
      : notFound("Question");
  }

  return NextResponse.json({ saved: true });
}
