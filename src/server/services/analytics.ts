import { prisma } from "@/lib/prisma";

/**
 * Attempts that count toward the reported figures.
 *
 * Guest attempts are deliberately excluded from every statistic on this screen. A demo code
 * handed out to a class would otherwise move the platform-wide averages and pass rates that
 * an admin uses to judge real student performance. The attempts themselves stay fully
 * browsable under /admin/attempts, where the Guests filter separates them out.
 */
const NON_GUEST = { user: { role: { not: "GUEST" } } } as const;

export type PlatformOverview = {
  users: number;
  admins: number;
  students: number;
  activeUsers: number;
  subjects: number;
  publishedSubjects: number;
  questions: number;
  activeQuestions: number;
  attempts: number;
  submittedAttempts: number;
  inProgressAttempts: number;
  averagePercentage: number | null;
  passRate: number | null;
};

export type SubjectStat = {
  id: string;
  title: string;
  isPublished: boolean;
  isActive: boolean;
  passMark: number;
  questionCount: number;
  attemptCount: number;
  averagePercentage: number | null;
  bestPercentage: number | null;
  passCount: number;
  passRate: number | null;
};

export type HardQuestion = {
  id: string;
  text: string;
  subjectId: string;
  subjectTitle: string;
  answered: number;
  correct: number;
  correctRate: number;
};

export type ScoreBucket = { label: string; from: number; to: number; count: number };

function round(value: number | null | undefined, dp = 1): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number(value.toFixed(dp));
}

/**
 * Per-subject attempt statistics.
 *
 * Pass rate compares each attempt's percentage against its own subject's pass mark, which
 * Prisma can't express as a single cross-field filter — so it's one bounded count per
 * subject rather than a scan of every attempt row.
 */
export async function getSubjectStats(): Promise<SubjectStat[]> {
  const subjects = await prisma.subject.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      isPublished: true,
      isActive: true,
      passMark: true,
      _count: { select: { questions: true } },
    },
  });

  if (subjects.length === 0) return [];

  const [grouped, passCounts] = await Promise.all([
    prisma.examAttempt.groupBy({
      by: ["subjectId"],
      where: { status: "SUBMITTED", ...NON_GUEST },
      _count: { _all: true },
      _avg: { percentage: true },
      _max: { percentage: true },
    }),
    Promise.all(
      subjects.map((subject) =>
        prisma.examAttempt.count({
          where: {
            subjectId: subject.id,
            status: "SUBMITTED",
            percentage: { gte: subject.passMark },
            ...NON_GUEST,
          },
        })
      )
    ),
  ]);

  const byId = new Map(grouped.map((row) => [row.subjectId, row]));

  return subjects.map((subject, index) => {
    const row = byId.get(subject.id);
    const attemptCount = row?._count._all ?? 0;
    const passCount = passCounts[index];

    return {
      id: subject.id,
      title: subject.title,
      isPublished: subject.isPublished,
      isActive: subject.isActive,
      passMark: subject.passMark,
      questionCount: subject._count.questions,
      attemptCount,
      averagePercentage: round(row?._avg.percentage),
      bestPercentage: round(row?._max.percentage),
      passCount,
      passRate: attemptCount > 0 ? round((passCount / attemptCount) * 100) : null,
    };
  });
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const [
    users,
    admins,
    activeUsers,
    subjects,
    publishedSubjects,
    questions,
    activeQuestions,
    attempts,
    submittedAttempts,
    inProgressAttempts,
    scoreAggregate,
    subjectStats,
  ] = await Promise.all([
    prisma.user.count({ where: { role: { not: "GUEST" } } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { isActive: true, role: { not: "GUEST" } } }),
    prisma.subject.count(),
    prisma.subject.count({ where: { isPublished: true, isActive: true } }),
    prisma.question.count(),
    prisma.question.count({ where: { isActive: true } }),
    prisma.examAttempt.count({ where: NON_GUEST }),
    prisma.examAttempt.count({ where: { status: "SUBMITTED", ...NON_GUEST } }),
    prisma.examAttempt.count({ where: { status: "IN_PROGRESS", ...NON_GUEST } }),
    prisma.examAttempt.aggregate({
      where: { status: "SUBMITTED", ...NON_GUEST },
      _avg: { percentage: true },
    }),
    getSubjectStats(),
  ]);

  const totalPasses = subjectStats.reduce((sum, stat) => sum + stat.passCount, 0);

  return {
    users,
    admins,
    students: users - admins,
    activeUsers,
    subjects,
    publishedSubjects,
    questions,
    activeQuestions,
    attempts,
    submittedAttempts,
    inProgressAttempts,
    averagePercentage: round(scoreAggregate._avg.percentage),
    passRate: submittedAttempts > 0 ? round((totalPasses / submittedAttempts) * 100) : null,
  };
}

/**
 * Questions students get wrong most often — the signal an admin needs to spot a badly
 * worded question or a topic that needs better teaching material.
 */
export async function getHardestQuestions(limit = 10, minAnswers = 3): Promise<HardQuestion[]> {
  const [totals, corrects] = await Promise.all([
    prisma.userAnswer.groupBy({
      by: ["questionId"],
      where: { attempt: { status: "SUBMITTED", ...NON_GUEST } },
      _count: { _all: true },
    }),
    prisma.userAnswer.groupBy({
      by: ["questionId"],
      where: { attempt: { status: "SUBMITTED", ...NON_GUEST }, isCorrect: true },
      _count: { _all: true },
    }),
  ]);

  if (totals.length === 0) return [];

  const correctById = new Map(corrects.map((row) => [row.questionId, row._count._all]));

  const ranked = totals
    .map((row) => {
      const answered = row._count._all;
      const correct = correctById.get(row.questionId) ?? 0;
      return { questionId: row.questionId, answered, correct, correctRate: correct / answered };
    })
    .filter((row) => row.answered >= minAnswers)
    .sort((a, b) => a.correctRate - b.correctRate || b.answered - a.answered)
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const questions = await prisma.question.findMany({
    where: { id: { in: ranked.map((row) => row.questionId) } },
    select: { id: true, text: true, subject: { select: { id: true, title: true } } },
  });
  const questionById = new Map(questions.map((question) => [question.id, question]));

  return ranked.flatMap((row) => {
    const question = questionById.get(row.questionId);
    if (!question) return [];
    return [
      {
        id: question.id,
        text: question.text,
        subjectId: question.subject.id,
        subjectTitle: question.subject.title,
        answered: row.answered,
        correct: row.correct,
        correctRate: Number((row.correctRate * 100).toFixed(1)),
      },
    ];
  });
}

/** Ten-point score buckets across all submitted attempts. */
export async function getScoreDistribution(): Promise<ScoreBucket[]> {
  const ranges = Array.from({ length: 10 }, (_, index) => ({
    from: index * 10,
    to: index === 9 ? 100 : index * 10 + 10,
  }));

  const counts = await Promise.all(
    ranges.map((range, index) =>
      prisma.examAttempt.count({
        where: {
          status: "SUBMITTED",
          ...NON_GUEST,
          percentage:
            index === 9
              ? { gte: range.from, lte: 100 }
              : { gte: range.from, lt: range.to },
        },
      })
    )
  );

  return ranges.map((range, index) => ({
    label: `${range.from}–${range.to}%`,
    from: range.from,
    to: range.to,
    count: counts[index],
  }));
}
