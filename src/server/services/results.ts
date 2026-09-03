import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { ExamAttemptModel } from "@/models";
import type { QuestionType } from "@/types/models";

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
  type: QuestionType;
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

/** The populated shape this loader reads. `.lean()` cannot infer virtual populate. */
type ResultRow = {
  id: string;
  attemptNumber: number;
  score: number | null;
  totalPoints: number | null;
  percentage: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  unansweredCount: number | null;
  timeSpentSec: number | null;
  submittedAt: Date | null;
  isAutoSubmitted: boolean;
  subject: {
    id: string;
    slug: string;
    title: string;
    passMark: number;
    durationMin: number;
  } | null;
  answers: Array<{
    isCorrect: boolean | null;
    selectedOptionId: string | null;
    selectedOptionIds: string[];
    question: {
      id: string;
      text: string;
      type: QuestionType;
      points: number;
      explanation: string | null;
      topic: { name: string } | null;
      options: Array<{ id: string; text: string; isCorrect: boolean }>;
    } | null;
  }>;
  flags: Array<{ questionId: string }>;
};

/** Loads a submitted attempt with full review data, scoped to its owner. */
export async function loadAttemptResult(
  attemptId: string,
  userId: string
): Promise<AttemptResult | null> {
  await connectToDatabase();

  const raw = await ExamAttemptModel.findOne({
    _id: attemptId,
    userId,
    status: "SUBMITTED",
  })
    .populate({ path: "subject", select: "slug title passMark durationMin" })
    .populate({
      path: "answers",
      options: { sort: { order: 1 } },
      select: "isCorrect selectedOptionId selectedOptionIds questionId",
      populate: {
        path: "question",
        select: "text type points explanation topicId",
        populate: [
          { path: "topic", select: "name" },
          // `isCorrect` IS selected here, unlike the in-exam payload. Safe only because
          // the query above is pinned to status SUBMITTED and this user.
          {
            path: "options",
            select: "text isCorrect order",
            options: { sort: { order: 1 } },
          },
        ],
      },
    })
    .populate({ path: "flags", select: "questionId" })
    .lean();

  if (!raw) return null;

  const attempt = normalizeIds(raw) as unknown as ResultRow;
  if (!attempt.subject) return null;

  const flagged = new Set(attempt.flags.map((flag) => flag.questionId));

  const questions: ReviewQuestion[] = attempt.answers
    .filter((answer) => answer.question !== null)
    .map((answer, index) => {
      const question = answer.question!;
      const selected = new Set((answer.selectedOptionIds ?? []).filter(Boolean));
      if (answer.selectedOptionId) selected.add(answer.selectedOptionId);

      // `isCorrect` is the grader's verdict: true / false / null for unanswered.
      const outcome: ReviewOutcome =
        answer.isCorrect === true ? "CORRECT" : selected.size === 0 ? "UNANSWERED" : "INCORRECT";

      return {
        id: question.id,
        number: index + 1,
        text: question.text,
        type: question.type,
        points: question.points,
        topicName: question.topic?.name ?? null,
        explanation: question.explanation,
        outcome,
        isFlagged: flagged.has(question.id),
        options: (question.options ?? []).map((option) => ({
          id: option.id,
          text: option.text,
          isCorrect: option.isCorrect,
          isSelected: selected.has(option.id),
        })),
      };
    });

  const percentage = attempt.percentage ?? 0;

  const siblings = await ExamAttemptModel.find({
    userId,
    subjectId: attempt.subject.id,
    status: "SUBMITTED",
  })
    .sort({ attemptNumber: 1 })
    .select("attemptNumber percentage")
    .lean();

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
