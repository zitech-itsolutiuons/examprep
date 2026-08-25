import { prisma } from "@/lib/prisma";
import { gradeAndSubmitAttempt } from "@/server/services/grading";

/**
 * Attempt lifecycle: starting, resuming, autosaving, flagging, and expiry.
 *
 * Two rules shape everything here:
 *   1. A student can only ever touch their own attempts — every loader takes a `userId`
 *      and filters on it, so an unknown attempt and someone else's attempt are
 *      indistinguishable from the outside.
 *   2. A SUBMITTED attempt is immutable. Answers and flags are writable only while the
 *      attempt is IN_PROGRESS and inside its time limit.
 */

/** The only subjects a student may see or sit. */
export const STUDENT_SUBJECT_FILTER = { isPublished: true, isActive: true } as const;

/**
 * Slack allowed on top of the time limit when accepting a save, so the answer a student
 * picks as the clock hits zero isn't lost to network latency or a slightly fast client.
 * It does not extend the exam: `timeSpentSec` is still capped at the real limit.
 */
const SAVE_GRACE_SEC = 10;

export type SaveOutcome =
  | { ok: true; expired?: false }
  | { ok: false; reason: "NOT_FOUND" | "SUBMITTED" | "EXPIRED" | "BAD_OPTION" | "TOO_MANY" };

/** Wall-clock instant at which an attempt stops accepting writes. */
export function deadlineFor(startedAt: Date, durationMin: number) {
  return new Date(startedAt.getTime() + durationMin * 60_000);
}

export function secondsRemaining(startedAt: Date, durationMin: number) {
  const ms = deadlineFor(startedAt, durationMin).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

function isPastDeadline(startedAt: Date, durationMin: number, graceSec = 0) {
  return Date.now() > deadlineFor(startedAt, durationMin).getTime() + graceSec * 1000;
}

/**
 * Loads an attempt the given user owns, or null. Used as the guard in front of every
 * attempt route — the ownership check is part of the query, never a later `if`.
 */
export async function loadOwnedAttempt(attemptId: string, userId: string) {
  return prisma.examAttempt.findFirst({
    where: { id: attemptId, userId },
    select: {
      id: true,
      userId: true,
      subjectId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      attemptNumber: true,
      subject: {
        select: { id: true, slug: true, title: true, durationMin: true, passMark: true },
      },
    },
  });
}

export type StartAttemptResult =
  | { ok: true; attemptId: string; resumed: boolean }
  | { ok: false; reason: "SUBJECT_UNAVAILABLE" | "NO_QUESTIONS" };

/**
 * Starts a fresh attempt, or hands back the one already in progress.
 *
 * A retake always creates a new `ExamAttempt` row with the next `attemptNumber`; earlier
 * attempts and their answers are never touched, so history and past results survive
 * every retake. If the in-progress attempt found here has already run out of time it is
 * graded and submitted first, so an abandoned exam can't be resumed hours later.
 */
export async function startOrResumeAttempt(
  userId: string,
  subjectId: string
): Promise<StartAttemptResult> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, ...STUDENT_SUBJECT_FILTER },
    select: { id: true, durationMin: true },
  });
  if (!subject) return { ok: false, reason: "SUBJECT_UNAVAILABLE" };

  const stale = await prisma.examAttempt.findFirst({
    where: { userId, subjectId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  });

  if (stale) {
    if (!isPastDeadline(stale.startedAt, subject.durationMin)) {
      return { ok: true, attemptId: stale.id, resumed: true };
    }
    // Out of time: bank the result before letting the student start again.
    await gradeAndSubmitAttempt(stale.id, { autoSubmitted: true }).catch(() => undefined);
  }

  // Snapshot the live question set. Ordering is the bank's own order so admins control
  // it; the `order` column freezes it for this attempt.
  const questions = await prisma.question.findMany({
    where: { subjectId, isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (questions.length === 0) return { ok: false, reason: "NO_QUESTIONS" };

  const attempt = await prisma.$transaction(async (tx) => {
    // Re-checked inside the transaction so two rapid "Start" clicks resume one attempt
    // instead of racing to create two.
    const existing = await tx.examAttempt.findFirst({
      where: { userId, subjectId, status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    if (existing) return { id: existing.id, resumed: true };

    const priorAttempts = await tx.examAttempt.count({ where: { userId, subjectId } });

    const created = await tx.examAttempt.create({
      data: {
        userId,
        subjectId,
        status: "IN_PROGRESS",
        attemptNumber: priorAttempts + 1,
        answers: {
          create: questions.map((question, index) => ({
            questionId: question.id,
            order: index,
          })),
        },
      },
      select: { id: true },
    });

    return { id: created.id, resumed: false };
  });

  return { ok: true, attemptId: attempt.id, resumed: attempt.resumed };
}

export type ExamQuestion = {
  id: string;
  order: number;
  text: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  points: number;
  topicName: string | null;
  /** Option text only — `isCorrect` is deliberately absent from this payload. */
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  isSkipped: boolean;
  isFlagged: boolean;
};

export type ExamState = {
  attemptId: string;
  attemptNumber: number;
  subject: { slug: string; title: string; durationMin: number; passMark: number };
  startedAt: string;
  secondsRemaining: number;
  totalPoints: number;
  questions: ExamQuestion[];
};

/**
 * Builds the runner payload for an in-progress attempt.
 *
 * This is the response a student's browser receives, so it carries no correctness data
 * at all: options arrive as `{ id, text }`, and neither `isCorrect` nor `explanation` is
 * selected. Grading reads those straight from the database at submit time instead.
 */
export async function loadExamState(attemptId: string, userId: string): Promise<ExamState | null> {
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId, status: "IN_PROGRESS" },
    select: {
      id: true,
      attemptNumber: true,
      startedAt: true,
      subject: { select: { slug: true, title: true, durationMin: true, passMark: true } },
      answers: {
        orderBy: { order: "asc" },
        select: {
          order: true,
          selectedOptionId: true,
          selectedOptionIds: true,
          isSkipped: true,
          question: {
            select: {
              id: true,
              text: true,
              type: true,
              points: true,
              topic: { select: { name: true } },
              options: { orderBy: { order: "asc" }, select: { id: true, text: true } },
            },
          },
        },
      },
      flags: { select: { questionId: true } },
    },
  });

  if (!attempt) return null;

  const flagged = new Set(attempt.flags.map((flag) => flag.questionId));

  const questions: ExamQuestion[] = attempt.answers.map((answer) => {
    const selected = new Set(answer.selectedOptionIds.filter(Boolean));
    if (answer.selectedOptionId) selected.add(answer.selectedOptionId);

    return {
      id: answer.question.id,
      order: answer.order,
      text: answer.question.text,
      type: answer.question.type,
      points: answer.question.points,
      topicName: answer.question.topic?.name ?? null,
      options: answer.question.options,
      selectedOptionIds: [...selected],
      isSkipped: answer.isSkipped,
      isFlagged: flagged.has(answer.question.id),
    };
  });

  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    subject: attempt.subject,
    startedAt: attempt.startedAt.toISOString(),
    secondsRemaining: secondsRemaining(attempt.startedAt, attempt.subject.durationMin),
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    questions,
  };
}

/**
 * Records a student's selection for one question.
 *
 * The `UserAnswer` row must already exist — it was created when the attempt started —
 * so a questionId outside this attempt's snapshot is rejected rather than inserted.
 * Every submitted option id is checked to belong to that same question, and the
 * question's type decides how many selections are allowed. Correctness is *not*
 * evaluated or stored here; `isCorrect` stays null until the attempt is graded.
 */
export async function saveAnswer(
  attemptId: string,
  userId: string,
  input: { questionId: string; selectedOptionIds: string[]; isSkipped: boolean }
): Promise<SaveOutcome> {
  const attempt = await loadOwnedAttempt(attemptId, userId);
  if (!attempt) return { ok: false, reason: "NOT_FOUND" };
  if (attempt.status !== "IN_PROGRESS") return { ok: false, reason: "SUBMITTED" };
  if (isPastDeadline(attempt.startedAt, attempt.subject.durationMin, SAVE_GRACE_SEC)) {
    return { ok: false, reason: "EXPIRED" };
  }

  const answer = await prisma.userAnswer.findUnique({
    where: { attemptId_questionId: { attemptId, questionId: input.questionId } },
    select: {
      id: true,
      question: {
        select: { type: true, options: { select: { id: true } } },
      },
    },
  });
  if (!answer) return { ok: false, reason: "NOT_FOUND" };

  const validIds = new Set(answer.question.options.map((option) => option.id));
  const selected = [...new Set(input.selectedOptionIds)];

  if (selected.some((id) => !validIds.has(id))) return { ok: false, reason: "BAD_OPTION" };
  if (answer.question.type !== "MULTIPLE_CHOICE" && selected.length > 1) {
    return { ok: false, reason: "TOO_MANY" };
  }

  const isMultiSelect = answer.question.type === "MULTIPLE_CHOICE";
  const answered = selected.length > 0;

  await prisma.userAnswer.update({
    where: { id: answer.id },
    data: {
      // Single-answer types also populate the scalar relation so result review can join
      // straight to the chosen option; multiple-choice keeps the array only.
      selectedOptionId: isMultiSelect ? null : selected[0] ?? null,
      selectedOptionIds: selected,
      // Choosing an answer clears a previous skip; an explicit skip only sticks while
      // nothing is selected.
      isSkipped: answered ? false : input.isSkipped,
      answeredAt: answered ? new Date() : null,
    },
  });

  return { ok: true };
}

/** Adds or removes a flag for one question in an attempt. Flags are per attempt. */
export async function setFlag(
  attemptId: string,
  userId: string,
  input: { questionId: string; flagged: boolean }
): Promise<SaveOutcome> {
  const attempt = await loadOwnedAttempt(attemptId, userId);
  if (!attempt) return { ok: false, reason: "NOT_FOUND" };
  if (attempt.status !== "IN_PROGRESS") return { ok: false, reason: "SUBMITTED" };

  const inAttempt = await prisma.userAnswer.findUnique({
    where: { attemptId_questionId: { attemptId, questionId: input.questionId } },
    select: { id: true },
  });
  if (!inAttempt) return { ok: false, reason: "NOT_FOUND" };

  if (input.flagged) {
    await prisma.flaggedQuestion.upsert({
      where: { attemptId_questionId: { attemptId, questionId: input.questionId } },
      create: { attemptId, questionId: input.questionId, userId },
      update: {},
    });
  } else {
    await prisma.flaggedQuestion.deleteMany({
      where: { attemptId, questionId: input.questionId },
    });
  }

  return { ok: true };
}
