import { prisma } from "@/lib/prisma";
import { secondsRemaining, STUDENT_SUBJECT_FILTER } from "@/server/services/attempts";

/**
 * Student-facing progress reads for the dashboard and history pages.
 *
 * Every query here is scoped to a single `userId` passed in by the caller, which the
 * pages take from the session — so these functions can't be pointed at another student.
 *
 * `UserProgress` is the denormalised cache that grading maintains; these reads go to
 * `ExamAttempt` directly because the dashboard needs per-attempt ordering for the trend,
 * which the aggregate row can't express.
 */

export type TrendPoint = {
  attemptId: string;
  index: number;
  attemptNumber: number;
  subjectTitle: string;
  subjectSlug: string;
  percentage: number;
  passMark: number;
  passed: boolean;
  submittedAt: Date;
};

export type SubjectProgressRow = {
  subjectId: string;
  slug: string;
  title: string;
  passMark: number;
  /** False when the admin has since unpublished or deactivated the subject. */
  isAvailable: boolean;
  attemptsCount: number;
  bestPercentage: number;
  averagePercentage: number;
  lastPercentage: number;
  lastAttemptAt: Date;
  /** Last attempt minus the one before it, or null on a first attempt. */
  delta: number | null;
};

export type LiveAttempt = {
  attemptId: string;
  subjectTitle: string;
  subjectSlug: string;
  attemptNumber: number;
  startedAt: Date;
  secondsRemaining: number;
  answered: number;
  total: number;
};

export type StudentOverview = {
  submittedCount: number;
  subjectsAttempted: number;
  subjectsAvailable: number;
  averagePercentage: number | null;
  bestPercentage: number | null;
  lastPercentage: number | null;
  /** Share of submitted attempts that met their own subject's pass mark. */
  passRate: number | null;
  /**
   * Recent form minus earlier form: the chronological run of attempts is split in half
   * and the averages compared. Null until there are at least two submitted attempts.
   */
  improvement: number | null;
  live: LiveAttempt[];
  trend: TrendPoint[];
  subjects: SubjectProgressRow[];
};

function round(value: number, dp = 1) {
  return Number(value.toFixed(dp));
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type AttemptHistoryRow = {
  attemptId: string;
  attemptNumber: number;
  status: "IN_PROGRESS" | "SUBMITTED" | "ABANDONED";
  subjectId: string;
  subjectTitle: string;
  subjectSlug: string;
  passMark: number;
  percentage: number | null;
  score: number | null;
  totalPoints: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  unansweredCount: number | null;
  timeSpentSec: number | null;
  isAutoSubmitted: boolean;
  startedAt: Date;
  submittedAt: Date | null;
  passed: boolean | null;
};

/** Every attempt this student has ever made, newest first. */
export async function getAttemptHistory(userId: string): Promise<AttemptHistoryRow[]> {
  const attempts = await prisma.examAttempt.findMany({
    where: { userId },
    orderBy: [{ startedAt: "desc" }],
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      percentage: true,
      score: true,
      totalPoints: true,
      correctCount: true,
      incorrectCount: true,
      unansweredCount: true,
      timeSpentSec: true,
      isAutoSubmitted: true,
      startedAt: true,
      submittedAt: true,
      subject: { select: { id: true, title: true, slug: true, passMark: true } },
    },
  });

  return attempts.map((attempt) => ({
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    subjectId: attempt.subject.id,
    subjectTitle: attempt.subject.title,
    subjectSlug: attempt.subject.slug,
    passMark: attempt.subject.passMark,
    percentage: attempt.percentage,
    score: attempt.score,
    totalPoints: attempt.totalPoints,
    correctCount: attempt.correctCount,
    incorrectCount: attempt.incorrectCount,
    unansweredCount: attempt.unansweredCount,
    timeSpentSec: attempt.timeSpentSec,
    isAutoSubmitted: attempt.isAutoSubmitted,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    passed:
      attempt.status === "SUBMITTED"
        ? (attempt.percentage ?? 0) >= attempt.subject.passMark
        : null,
  }));
}

/** Dashboard payload: headline stats, resumable attempts, trend, and per-subject rows. */
export async function getStudentOverview(userId: string): Promise<StudentOverview> {
  const [submitted, inProgress, subjectsAvailable] = await Promise.all([
    prisma.examAttempt.findMany({
      where: { userId, status: "SUBMITTED" },
      orderBy: [{ submittedAt: "asc" }],
      select: {
        id: true,
        attemptNumber: true,
        percentage: true,
        submittedAt: true,
        subject: {
          select: {
            id: true,
            title: true,
            slug: true,
            passMark: true,
            isPublished: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.examAttempt.findMany({
      where: { userId, status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        attemptNumber: true,
        startedAt: true,
        subject: { select: { title: true, slug: true, durationMin: true } },
        // Small by construction — one row per question in the attempt.
        answers: { select: { answeredAt: true } },
      },
    }),
    prisma.subject.count({
      where: { ...STUDENT_SUBJECT_FILTER, questions: { some: { isActive: true } } },
    }),
  ]);

  const trend: TrendPoint[] = submitted.map((attempt, index) => {
    const percentage = attempt.percentage ?? 0;
    return {
      attemptId: attempt.id,
      index,
      attemptNumber: attempt.attemptNumber,
      subjectTitle: attempt.subject.title,
      subjectSlug: attempt.subject.slug,
      percentage: round(percentage),
      passMark: attempt.subject.passMark,
      passed: percentage >= attempt.subject.passMark,
      submittedAt: attempt.submittedAt ?? new Date(),
    };
  });

  const percentages = trend.map((point) => point.percentage);
  const passes = trend.filter((point) => point.passed).length;

  // Recent form vs earlier form. With an odd count the middle attempt falls into the
  // recent half, so the comparison never silently drops a data point.
  let improvement: number | null = null;
  if (percentages.length >= 2) {
    const split = Math.floor(percentages.length / 2);
    improvement = round(mean(percentages.slice(split)) - mean(percentages.slice(0, split)));
  }

  // Group by subject to build the per-subject rows.
  const bySubject = new Map<string, TrendPoint[]>();
  for (const point of trend) {
    const attempt = submitted[point.index];
    const key = attempt.subject.id;
    const list = bySubject.get(key);
    if (list) list.push(point);
    else bySubject.set(key, [point]);
  }

  const subjects: SubjectProgressRow[] = [...bySubject.entries()]
    .map(([subjectId, points]) => {
      const attempt = submitted[points[0].index];
      const values = points.map((point) => point.percentage);
      const last = points[points.length - 1];
      const previous = points.length >= 2 ? points[points.length - 2] : null;

      return {
        subjectId,
        slug: attempt.subject.slug,
        title: attempt.subject.title,
        passMark: attempt.subject.passMark,
        isAvailable: attempt.subject.isPublished && attempt.subject.isActive,
        attemptsCount: points.length,
        bestPercentage: round(Math.max(...values)),
        averagePercentage: round(mean(values)),
        lastPercentage: last.percentage,
        lastAttemptAt: last.submittedAt,
        delta: previous ? round(last.percentage - previous.percentage) : null,
      };
    })
    .sort((a, b) => b.lastAttemptAt.getTime() - a.lastAttemptAt.getTime());

  const live: LiveAttempt[] = inProgress.map((attempt) => ({
    attemptId: attempt.id,
    subjectTitle: attempt.subject.title,
    subjectSlug: attempt.subject.slug,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    secondsRemaining: secondsRemaining(attempt.startedAt, attempt.subject.durationMin),
    answered: attempt.answers.filter((answer) => answer.answeredAt !== null).length,
    total: attempt.answers.length,
  }));

  return {
    submittedCount: trend.length,
    subjectsAttempted: bySubject.size,
    subjectsAvailable,
    averagePercentage: percentages.length > 0 ? round(mean(percentages)) : null,
    bestPercentage: percentages.length > 0 ? round(Math.max(...percentages)) : null,
    lastPercentage: percentages.length > 0 ? percentages[percentages.length - 1] : null,
    passRate: trend.length > 0 ? round((passes / trend.length) * 100) : null,
    improvement,
    live,
    trend,
    subjects,
  };
}
