import type { ClientSession } from "mongoose";

import { connectToDatabase, mongoose } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { ExamAttemptModel, UserAnswerModel, UserProgressModel } from "@/models";

/**
 * Server-side grading.
 *
 * Nothing in this module is reachable from the client except through
 * `POST /api/attempts/[id]/submit`, and no route ever ships `QuestionOption.isCorrect`
 * to a student before their attempt is submitted — so the only place correctness is
 * ever decided is here, on the server, against the database.
 *
 * Grading is driven by the `UserAnswer` documents written when the attempt started, which
 * means the question set is the one the student actually sat, even if an admin has
 * since deactivated or edited questions in the bank.
 */

export type GradeResult = {
  score: number;
  totalPoints: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  timeSpentSec: number;
  passed: boolean;
};

/** Raised when an attempt is graded twice — submitted results are immutable. */
export class AttemptNotGradableError extends Error {
  constructor(public status: string) {
    super(
      status === "IN_PROGRESS"
        ? "This attempt cannot be graded."
        : "This attempt has already been submitted and can no longer be changed."
    );
    this.name = "AttemptNotGradableError";
  }
}

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/**
 * The selection to grade, normalised across question types.
 *
 * `selectedOptionId` (single-choice / true-false) and `selectedOptionIds`
 * (multiple-choice) are both read, so a document written by either path grades correctly
 * even if a question's type was changed between attempts.
 */
function selectedIds(answer: {
  selectedOptionId: string | null;
  selectedOptionIds: string[];
}): Set<string> {
  const ids = new Set((answer.selectedOptionIds ?? []).filter(Boolean));
  if (answer.selectedOptionId) ids.add(answer.selectedOptionId);
  return ids;
}

/** The populated shape grading reads. `.lean()` cannot infer virtual populate. */
type GradableAttempt = {
  id: string;
  userId: string;
  subjectId: string;
  status: string;
  startedAt: Date;
  subject: { durationMin: number; passMark: number } | null;
  answers: Array<{
    id: string;
    selectedOptionId: string | null;
    selectedOptionIds: string[];
    /** Null only if the question was hard-deleted without its cascade running. */
    question: { points: number; options: Array<{ id: string }> } | null;
  }>;
};

/**
 * Grades an in-progress attempt, marks it SUBMITTED, and refreshes the student's
 * `UserProgress` document for the subject. Idempotent by guard, not by retry: a second
 * call throws `AttemptNotGradableError` rather than overwriting a stored result.
 *
 * `autoSubmitted` records that the timer ran out instead of the student pressing submit.
 */
export async function gradeAndSubmitAttempt(
  attemptId: string,
  { autoSubmitted = false }: { autoSubmitted?: boolean } = {}
): Promise<GradeResult> {
  await connectToDatabase();

  const raw = await ExamAttemptModel.findOne({ _id: attemptId })
    .populate({ path: "subject", select: "durationMin passMark" })
    .populate({
      path: "answers",
      select: "selectedOptionId selectedOptionIds questionId",
      populate: {
        path: "question",
        select: "points",
        // Prisma's `options: { where: { isCorrect: true } }`. `match` filters the populated
        // set, so `options` here is the ANSWER KEY and nothing else.
        populate: { path: "options", match: { isCorrect: true }, select: "_id" },
      },
    })
    .lean();

  if (!raw) throw new AttemptNotGradableError("MISSING");

  const attempt = normalizeIds(raw) as unknown as GradableAttempt;
  if (attempt.status !== "IN_PROGRESS") throw new AttemptNotGradableError(attempt.status);
  if (!attempt.subject) throw new AttemptNotGradableError("MISSING");

  const correctIds: string[] = [];
  const incorrectIds: string[] = [];
  const unansweredIds: string[] = [];

  let score = 0;
  let totalPoints = 0;

  for (const answer of attempt.answers) {
    // Under SQL this could not happen: deleting a question cascaded the answer away with
    // it. Mongo has no such guarantee, so a snapshot row pointing at a deleted question is
    // skipped rather than counted — it can neither be answered nor scored.
    if (!answer.question) continue;

    const points = answer.question.points;
    totalPoints += points;

    const selected = selectedIds(answer);
    if (selected.size === 0) {
      unansweredIds.push(answer.id);
      continue;
    }

    // All-or-nothing: a multiple-choice question scores only on an exact match of the
    // correct set, so partial selections are wrong rather than partially credited.
    const expected = new Set(answer.question.options.map((option) => option.id));
    if (expected.size > 0 && sameSet(selected, expected)) {
      correctIds.push(answer.id);
      score += points;
    } else {
      incorrectIds.push(answer.id);
    }
  }

  const percentage = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
  const passMark = attempt.subject.passMark;

  // Elapsed time is capped at the subject's limit so a browser left open overnight
  // can't report a wall-clock duration longer than the exam allowed.
  const limitSec = attempt.subject.durationMin * 60;
  const elapsedSec = Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000);
  const timeSpentSec = Math.max(0, Math.min(elapsedSec, limitSec));

  const result: GradeResult = {
    score,
    totalPoints,
    percentage: Math.round(percentage * 100) / 100,
    correctCount: correctIds.length,
    incorrectCount: incorrectIds.length,
    unansweredCount: unansweredIds.length,
    timeSpentSec,
    passed: percentage >= passMark,
  };

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // The status guard is re-applied as part of the write, so two concurrent submits
      // can't both succeed — the loser matches 0 documents and is rejected below.
      const claimed = await ExamAttemptModel.updateOne(
        { _id: attempt.id, status: "IN_PROGRESS" },
        {
          $set: {
            status: "SUBMITTED",
            score: result.score,
            totalPoints: result.totalPoints,
            percentage: result.percentage,
            correctCount: result.correctCount,
            incorrectCount: result.incorrectCount,
            unansweredCount: result.unansweredCount,
            timeSpentSec: result.timeSpentSec,
            isAutoSubmitted: autoSubmitted,
            submittedAt: new Date(),
          },
        },
        { session }
      );

      // matchedCount, not modifiedCount: the filter carries the IN_PROGRESS guard, so a
      // zero match is exactly "someone else already submitted this".
      if (claimed.matchedCount === 0) throw new AttemptNotGradableError("SUBMITTED");

      if (correctIds.length > 0) {
        await UserAnswerModel.updateMany(
          { _id: { $in: correctIds } },
          { $set: { isCorrect: true } },
          { session }
        );
      }
      if (incorrectIds.length > 0) {
        await UserAnswerModel.updateMany(
          { _id: { $in: incorrectIds } },
          { $set: { isCorrect: false } },
          { session }
        );
      }
      if (unansweredIds.length > 0) {
        await UserAnswerModel.updateMany(
          { _id: { $in: unansweredIds } },
          { $set: { isCorrect: null } },
          { session }
        );
      }

      await recalculateProgress(session, attempt.userId, attempt.subjectId);
    });
  } finally {
    await session.endSession();
  }

  return result;
}

/**
 * Rebuilds the denormalised `UserProgress` document from every SUBMITTED attempt for this
 * user+subject. Recomputing from scratch (rather than folding the new attempt into the
 * old aggregate) keeps the document correct even if an attempt is ever removed.
 *
 * Takes the Mongoose `ClientSession` where it used to take a Prisma transaction client, so
 * the recalculation still commits or rolls back with the submit that triggered it.
 */
export async function recalculateProgress(
  session: ClientSession | null,
  userId: string,
  subjectId: string
) {
  // Mongoose's option types accept `undefined` but not `null` for a session.
  const ses = session ?? undefined;

  const attempts = await ExamAttemptModel.find({ userId, subjectId, status: "SUBMITTED" })
    .sort({ submittedAt: 1 })
    .select("score percentage submittedAt")
    .session(session)
    .lean();

  if (attempts.length === 0) {
    await UserProgressModel.deleteMany({ userId, subjectId }, { session: ses });
    return;
  }

  const percentages = attempts.map((a) => a.percentage ?? 0);
  const scores = attempts.map((a) => a.score ?? 0);
  const last = attempts[attempts.length - 1];

  const average = percentages.reduce((sum, value) => sum + value, 0) / percentages.length;

  const data = {
    attemptsCount: attempts.length,
    bestScore: Math.max(...scores),
    bestPercentage: Math.round(Math.max(...percentages) * 100) / 100,
    averagePercentage: Math.round(average * 100) / 100,
    lastPercentage: last.percentage ?? 0,
    lastAttemptAt: last.submittedAt,
  };

  // Prisma's upsert on @@unique([userId, subjectId]); the same pair is now a unique
  // compound index, so `upsert` targets exactly one document.
  await UserProgressModel.updateOne(
    { userId, subjectId },
    { $set: data, $setOnInsert: { userId, subjectId } },
    { upsert: true, session: ses }
  );
}
