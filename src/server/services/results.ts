import { prisma } from "@/lib/prisma";

/**
 * Result + review loading.
 *
 * Correct answers and explanations appear here for the first time in any student-facing
 * payload. That's safe because every loader below matches on `status: "SUBMITTED"` *and*
 * the owning `userId` — an attempt that is still in progress, or belongs to someone
 * else, simply doesn't resolve.
 */

export type ReviewOutcome = "CORRECT" | "INCORRECT" | "UNANSWERED";

export type ReviewQuestion = {
  id: string;
  number: number;
  text: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  points: number;
  topicName: string | null;
  explanation: string | null;
  outcome: ReviewOutcome;
  isFlagged: boolean;
  options: { id: string; text: string; isCorrect: boolean; isSelected: boolean }[];
};

export type AttemptResult = {
  attemptId: string;
  attemptNumber: number;
  subject: { id: string; slug: string; title: string; passMark: number; durationMin: number };
  score: number;
  totalPoints: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  timeSpentSec: number;
  submittedAt: Date;
  isAutoSubmitted: boolean;
  passed: boolean;
  questions: ReviewQuestion[];
  /** Context from this student's other submitted attempts at the same subject. */
  history: {
    attemptsCount: number;
    bestPercentage: number;
    averagePercentage: number;
    previousPercentage: number | null;
  };
};

/** Loads a submitted attempt with full review data, scoped to its owner. */
export async function loadAttemptResult(
  attemptId: string,
  userId: string
): Promise<AttemptResult | null> {
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId, status: "SUBMITTED" },
    select: {
      id: true,
      attemptNumber: true,
      score: true,
      totalPoints: true,
      percentage: true,
      correctCount: true,
      incorrectCount: true,
      unansweredCount: true,
      timeSpentSec: true,
      submittedAt: true,
      isAutoSubmitted: true,
      subject: {
        select: { id: true, slug: true, title: true, passMark: true, durationMin: true },
      },
      answers: {
        orderBy: { order: "asc" },
        select: {
          isCorrect: true,
          selectedOptionId: true,
          selectedOptionIds: true,
          question: {
            select: {
              id: true,
              text: true,
              type: true,
              points: true,
              explanation: true,
              topic: { select: { name: true } },
              options: {
                orderBy: { order: "asc" },
                select: { id: true, text: true, isCorrect: true },
              },
            },
          },
        },
      },
      flags: { select: { questionId: true } },
    },
  });

  if (!attempt) return null;

  const flagged = new Set(attempt.flags.map((flag) => flag.questionId));

  const questions: ReviewQuestion[] = attempt.answers.map((answer, index) => {
    const selected = new Set(answer.selectedOptionIds.filter(Boolean));
    if (answer.selectedOptionId) selected.add(answer.selectedOptionId);

    // `isCorrect` is the grader's verdict: true / false / null for unanswered.
    const outcome: ReviewOutcome =
      answer.isCorrect === true ? "CORRECT" : selected.size === 0 ? "UNANSWERED" : "INCORRECT";

    return {
      id: answer.question.id,
      number: index + 1,
      text: answer.question.text,
      type: answer.question.type,
      points: answer.question.points,
      topicName: answer.question.topic?.name ?? null,
      explanation: answer.question.explanation,
      outcome,
      isFlagged: flagged.has(answer.question.id),
      options: answer.question.options.map((option) => ({
        ...option,
        isSelected: selected.has(option.id),
      })),
    };
  });

  const percentage = attempt.percentage ?? 0;

  const siblings = await prisma.examAttempt.findMany({
    where: {
      userId,
      subjectId: attempt.subject.id,
      status: "SUBMITTED",
    },
    orderBy: { attemptNumber: "asc" },
    select: { attemptNumber: true, percentage: true },
  });

  const priors = siblings.filter((s) => s.attemptNumber < attempt.attemptNumber);
  const percentages = siblings.map((s) => s.percentage ?? 0);

  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    subject: attempt.subject,
    score: attempt.score ?? 0,
    totalPoints: attempt.totalPoints ?? 0,
    percentage,
    correctCount: attempt.correctCount ?? 0,
    incorrectCount: attempt.incorrectCount ?? 0,
    unansweredCount: attempt.unansweredCount ?? 0,
    timeSpentSec: attempt.timeSpentSec ?? 0,
    submittedAt: attempt.submittedAt ?? new Date(),
    isAutoSubmitted: attempt.isAutoSubmitted,
    passed: percentage >= attempt.subject.passMark,
    questions,
    history: {
      attemptsCount: siblings.length,
      bestPercentage: percentages.length > 0 ? Math.max(...percentages) : percentage,
      averagePercentage:
        percentages.length > 0
          ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
          : percentage,
      previousPercentage: priors.length > 0 ? priors[priors.length - 1].percentage ?? 0 : null,
    },
  };
}

/** Formats a duration for display, e.g. "12m 04s". */
export function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
