import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Server-side grading.
 *
 * Nothing in this module is reachable from the client except through
 * `POST /api/attempts/[id]/submit`, and no route ever ships `QuestionOption.isCorrect`
 * to a student before their attempt is submitted — so the only place correctness is
 * ever decided is here, on the server, against the database.
 *
 * Grading is driven by the `UserAnswer` rows written when the attempt started, which
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
 * (multiple-choice) are both read, so a row written by either path grades correctly
 * even if a question's type was changed between attempts.
 */
function selectedIds(answer: {
  selectedOptionId: string | null;
  selectedOptionIds: string[];
}): Set<string> {
  const ids = new Set(answer.selectedOptionIds.filter(Boolean));
  if (answer.selectedOptionId) ids.add(answer.selectedOptionId);
  return ids;
}

/**
 * Grades an in-progress attempt, marks it SUBMITTED, and refreshes the student's
 * `UserProgress` row for the subject. Idempotent by guard, not by retry: a second
 * call throws `AttemptNotGradableError` rather than overwriting a stored result.
 *
 * `autoSubmitted` records that the timer ran out instead of the student pressing submit.
 */
export async function gradeAndSubmitAttempt(
  attemptId: string,
  { autoSubmitted = false }: { autoSubmitted?: boolean } = {}
): Promise<GradeResult> {
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      subjectId: true,
      status: true,
      startedAt: true,
      subject: { select: { durationMin: true, passMark: true } },
      answers: {
        select: {
          id: true,
          selectedOptionId: true,
          selectedOptionIds: true,
          question: {
            select: {
              points: true,
              options: { where: { isCorrect: true }, select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!attempt) throw new AttemptNotGradableError("MISSING");
  if (attempt.status !== "IN_PROGRESS") throw new AttemptNotGradableError(attempt.status);

  const correctIds: string[] = [];
  const incorrectIds: string[] = [];
  const unansweredIds: string[] = [];

  let score = 0;
  let totalPoints = 0;

  for (const answer of attempt.answers) {
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

  await prisma.$transaction(async (tx) => {
    // The status guard is re-applied as part of the write, so two concurrent submits
    // can't both succeed — the loser updates 0 rows and is rejected below.
    const claimed = await tx.examAttempt.updateMany({
      where: { id: attempt.id, status: "IN_PROGRESS" },
      data: {
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
    });

    if (claimed.count === 0) throw new AttemptNotGradableError("SUBMITTED");

    if (correctIds.length > 0) {
      await tx.userAnswer.updateMany({
        where: { id: { in: correctIds } },
        data: { isCorrect: true },
      });
    }
    if (incorrectIds.length > 0) {
      await tx.userAnswer.updateMany({
        where: { id: { in: incorrectIds } },
        data: { isCorrect: false },
      });
    }
    if (unansweredIds.length > 0) {
      await tx.userAnswer.updateMany({
        where: { id: { in: unansweredIds } },
        data: { isCorrect: null },
      });
    }

    await recalculateProgress(tx, attempt.userId, attempt.subjectId);
  });

  return result;
}

/**
 * Rebuilds the denormalised `UserProgress` row from every SUBMITTED attempt for this
 * user+subject. Recomputing from scratch (rather than folding the new attempt into the
 * old aggregate) keeps the row correct even if an attempt is ever removed.
 */
export async function recalculateProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  subjectId: string
) {
  const attempts = await tx.examAttempt.findMany({
    where: { userId, subjectId, status: "SUBMITTED" },
    orderBy: { submittedAt: "asc" },
    select: { score: true, percentage: true, submittedAt: true },
  });

  if (attempts.length === 0) {
    await tx.userProgress.deleteMany({ where: { userId, subjectId } });
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

  await tx.userProgress.upsert({
    where: { userId_subjectId: { userId, subjectId } },
    create: { userId, subjectId, ...data },
    update: data,
  });
}
