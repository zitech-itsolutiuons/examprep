import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/rbac";
import { loadExamState, loadOwnedAttempt } from "@/server/services/attempts";
import { AttemptNotGradableError, gradeAndSubmitAttempt } from "@/server/services/grading";
import { ExamRunner } from "@/components/exam/exam-runner";

type Params = { params: { attemptId: string } };

export const metadata = { title: "Exam in progress" };
// Never cached: the payload is per-student and carries a live countdown.
export const dynamic = "force-dynamic";

/**
 * The exam runner sits outside the `(student)` route group on purpose — it renders its
 * own focused chrome with no sidebar, so nothing competes with the question.
 */
export default async function ExamPage({ params }: Params) {
  const user = await requireUser();

  const state = await loadExamState(params.attemptId, user.id);

  if (!state) {
    // `loadExamState` only matches IN_PROGRESS attempts owned by this user. Anything
    // else is either already submitted (send them to the result) or not theirs (404).
    const attempt = await loadOwnedAttempt(params.attemptId, user.id);
    if (!attempt) notFound();
    redirect(`/results/${attempt.id}`);
  }

  // The attempt's time is already gone — close it out here rather than rendering a dead
  // runner and trusting the client's timer to finish the job. Without this, an attempt
  // abandoned past its deadline would stay IN_PROGRESS until the student happened to
  // start another attempt at the same subject.
  if (state.secondsRemaining <= 0) {
    try {
      await gradeAndSubmitAttempt(state.attemptId, { autoSubmitted: true });
    } catch (error) {
      // Already submitted by a concurrent request — the result exists either way.
      if (!(error instanceof AttemptNotGradableError)) throw error;
    }
    redirect(`/results/${state.attemptId}`);
  }

  return (
    <ExamRunner
      attemptId={state.attemptId}
      attemptNumber={state.attemptNumber}
      subject={state.subject}
      secondsRemaining={state.secondsRemaining}
      questions={state.questions}
      homeHref={user.role === "GUEST" ? "/subjects" : "/dashboard"}
    />
  );
}
