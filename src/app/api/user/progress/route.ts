import { NextResponse } from "next/server";

import { requireApiAccount } from "@/lib/rbac";
import { getAttemptHistory, getStudentOverview } from "@/server/services/progress";

/**
 * The signed-in student's own progress: headline stats, live attempts, trend, and
 * per-subject rows. There is no userId parameter by design — the session decides whose
 * progress is returned, so this endpoint cannot be aimed at another student.
 *
 * `?include=history` appends the full attempt list.
 */
export async function GET(req: Request) {
  const auth = await requireApiAccount();
  if (auth.error) return auth.error;

  const wantsHistory = new URL(req.url).searchParams.get("include") === "history";

  const [overview, history] = await Promise.all([
    getStudentOverview(auth.user.id),
    wantsHistory ? getAttemptHistory(auth.user.id) : Promise.resolve(null),
  ]);

  return NextResponse.json(history ? { overview, history } : { overview });
}
