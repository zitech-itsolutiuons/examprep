import type { HomeBlock, HomeBlockKind, HomeMetric, HomePage, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** The landing page's copy lives in a single row under this fixed id. */
export const HOME_ID = "home";

/** Just the content columns — no id, no audit trail. */
export type HomeSettings = Omit<HomePage, "id" | "updatedById" | "createdAt" | "updatedAt">;

/**
 * The wording the site ships with.
 *
 * This is the single source of truth for it: the `home_page` columns carry no database
 * defaults, so `HOME_DEFAULTS` is what the seeder writes, what the admin PATCH falls back
 * to when creating the row, and what the public page renders before any row exists. The
 * public read never writes, so a fresh database still shows a complete landing page.
 */
export const HOME_DEFAULTS: HomeSettings = {
  brandLabel: "ExamPrep",

  heroBadge: "Computer-based test practice",
  heroTitle: "Practise like the exam, learn from every mistake.",
  heroSubtitle:
    "ExamPrep runs timed, exam-style question sets, grades them on the server, and shows you exactly what went wrong — then lets you retake without losing your history.",
  heroPrimaryLabel: "Create free account",
  heroPrimaryHref: "/register",
  heroSecondaryLabel: "I already have an account",
  heroSecondaryHref: "/login",

  statsEnabled: true,

  featuresEnabled: true,
  featuresTitle: "Everything a serious practice session needs",
  featuresSubtitle: "Built as a full exam engine — not a quiz widget.",

  stepsEnabled: true,
  stepsTitle: "How it works",
  stepsSubtitle: "Three steps from signing up to knowing exactly what to revise.",

  faqEnabled: true,
  faqTitle: "Questions, answered",
  faqSubtitle: null,

  ctaEnabled: true,
  ctaTitle: "Ready to sit your first practice exam?",
  ctaBody: "Create an account and start a timed attempt in under a minute. No card required.",
  ctaButtonLabel: "Get started free",
  ctaButtonHref: "/register",

  footerTagline: "Timed practice exams with server-side grading and full answer review.",

  metaTitle: null,
  metaDescription: null,
};

/** Seed content for the repeated sections, used by `prisma/seed.ts`. */
export const HOME_DEFAULT_BLOCKS: Record<
  HomeBlockKind,
  Array<Pick<HomeBlock, "title"> & Partial<Omit<HomeBlock, "id" | "kind" | "createdAt" | "updatedAt">>>
> = {
  STAT: [
    { title: "Practice subjects", metric: "SUBJECTS" },
    { title: "Questions in the bank", metric: "QUESTIONS" },
    { title: "Exams sat", metric: "ATTEMPTS" },
    { title: "Average score", metric: "AVERAGE_SCORE", value: "—" },
  ],
  FEATURE: [
    {
      title: "Real CBT conditions",
      icon: "timer",
      body: "A timed, single-question runner with flags, skips, and a live progress palette — the same rhythm as the real thing.",
    },
    {
      title: "Graded on the server",
      icon: "check",
      body: "Answers are scored the moment you submit. Correct answers never reach the browser before then.",
    },
    {
      title: "Mistake corrections",
      icon: "wand",
      body: "Review every question with your answer, the correct answer, and a written explanation for what went wrong.",
    },
    {
      title: "Unlimited retakes",
      icon: "refresh",
      body: "Each retake is a new attempt. Previous scores are preserved so you can see the trend, not just the last try.",
    },
    {
      title: "Progress you can see",
      icon: "barChart",
      body: "Best score, average, and improvement per subject, tracked across every attempt you make.",
    },
    {
      title: "Curated subjects",
      icon: "book",
      body: "Admins publish subjects with topics, options, and explanations — only active, published ones reach you.",
    },
  ],
  STEP: [
    {
      title: "Pick a subject",
      icon: "compass",
      body: "Browse the published subjects and see the duration, pass mark, and how many questions each one holds.",
    },
    {
      title: "Sit the exam",
      icon: "timer",
      body: "The clock runs on the server. Flag anything you want to revisit, skip freely, and your answers save as you go.",
    },
    {
      title: "Review and retake",
      icon: "trendingUp",
      body: "Get your score instantly, read the explanation behind every miss, then retake to watch the trend move.",
    },
  ],
  FAQ: [
    {
      title: "Is it free to use?",
      body: "Yes — creating an account and sitting practice exams costs nothing, and there's no card required to start.",
    },
    {
      title: "What happens if the timer runs out?",
      body: "The attempt submits itself automatically and is graded exactly as it stands. Anything unanswered is marked as such, and the result stays in your history.",
    },
    {
      title: "Can I retake an exam?",
      body: "As many times as you like. Every retake is recorded as a separate attempt, so your earlier scores stay intact and you can see whether you're improving.",
    },
    {
      title: "Will I see the correct answers?",
      body: "After you submit, yes — each question shows your answer, the correct one, and an explanation. Nothing is revealed while the exam is still running.",
    },
  ],
  LINK: [
    { title: "Log in", href: "/login" },
    { title: "Register", href: "/register" },
  ],
};

const KINDS: HomeBlockKind[] = ["STAT", "FEATURE", "STEP", "FAQ", "LINK"];

export type HomeBlocksByKind = Record<HomeBlockKind, HomeBlock[]>;

function emptyBlocks(): HomeBlocksByKind {
  return { STAT: [], FEATURE: [], STEP: [], FAQ: [], LINK: [] };
}

function groupByKind(blocks: HomeBlock[]): HomeBlocksByKind {
  const grouped = emptyBlocks();
  for (const block of blocks) grouped[block.kind].push(block);
  return grouped;
}

/** A stat with its figure already resolved to the string that gets rendered. */
export type ResolvedStat = { id: string; label: string; value: string };

export type HomeContent = {
  settings: HomeSettings;
  blocks: HomeBlocksByKind;
  stats: ResolvedStat[];
};

export type HomeAdminContent = {
  settings: HomeSettings;
  blocks: HomeBlocksByKind;
  /** Null until an admin has saved the page at least once. */
  updatedAt: Date | null;
  updatedByName: string | null;
  /** What each live metric currently resolves to, shown next to the picker in the editor. */
  metrics: Record<Exclude<HomeMetric, "MANUAL">, string | null>;
};

// ---------------------------------------------------------------------------
// LIVE METRICS
// ---------------------------------------------------------------------------

const integer = new Intl.NumberFormat("en-US");

/**
 * Guest attempts don't count toward the public figures.
 *
 * Same rule as the admin analytics: a demo code shouldn't be able to move the numbers the
 * landing page advertises. `STUDENTS` needs no filter because it already counts `role:
 * STUDENT` only.
 */
const NON_GUEST = { user: { role: { not: "GUEST" } } } as const;

/**
 * Counts the figures a stat block can display.
 *
 * Only the metrics actually referenced get queried — this runs on every public request, so
 * an unused PASS_RATE shouldn't cost a per-subject scan.
 */
async function computeMetrics(
  needed: Set<HomeMetric>
): Promise<Partial<Record<HomeMetric, number | null>>> {
  const wanted = (metric: HomeMetric) => needed.has(metric);

  const [students, subjects, questions, attempts, average, passRate] = await Promise.all([
    wanted("STUDENTS")
      ? prisma.user.count({ where: { role: "STUDENT", isActive: true } })
      : null,
    wanted("SUBJECTS")
      ? prisma.subject.count({ where: { isPublished: true, isActive: true } })
      : null,
    wanted("QUESTIONS")
      ? prisma.question.count({
          where: { isActive: true, subject: { isPublished: true, isActive: true } },
        })
      : null,
    wanted("ATTEMPTS")
      ? prisma.examAttempt.count({ where: { status: "SUBMITTED", ...NON_GUEST } })
      : null,
    wanted("AVERAGE_SCORE")
      ? prisma.examAttempt
          .aggregate({ where: { status: "SUBMITTED", ...NON_GUEST }, _avg: { percentage: true } })
          .then((row) => row._avg.percentage)
      : null,
    wanted("PASS_RATE") ? computePassRate() : null,
  ]);

  return {
    STUDENTS: students,
    SUBJECTS: subjects,
    QUESTIONS: questions,
    ATTEMPTS: attempts,
    AVERAGE_SCORE: average,
    PASS_RATE: passRate,
  };
}

/**
 * Share of submitted attempts that met their own subject's pass mark.
 *
 * Each attempt is compared against its subject's threshold, which Prisma can't express as
 * one cross-field filter — so it's one bounded count per subject, the same approach
 * `getSubjectStats` takes. Null when nothing has been submitted yet.
 */
async function computePassRate(): Promise<number | null> {
  const [subjects, submitted] = await Promise.all([
    prisma.subject.findMany({ select: { id: true, passMark: true } }),
    prisma.examAttempt.count({ where: { status: "SUBMITTED", ...NON_GUEST } }),
  ]);

  if (submitted === 0) return null;

  const passes = await Promise.all(
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
  );

  return (passes.reduce((sum, count) => sum + count, 0) / submitted) * 100;
}

function formatMetric(metric: HomeMetric, raw: number | null | undefined): string | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  if (metric === "PASS_RATE" || metric === "AVERAGE_SCORE") return `${Math.round(raw)}%`;
  return integer.format(Math.round(raw));
}

/**
 * Turns stat rows into display strings.
 *
 * A count renders even at zero — "0 exams sat" is true and harmless. A percentage with no
 * submitted attempts behind it has nothing honest to show, so it falls back to the block's
 * manual `value`, and is dropped from the band entirely if that is blank too: one fewer
 * stat reads better on a landing page than a stat showing a dash.
 */
function resolveStats(
  stats: HomeBlock[],
  metrics: Partial<Record<HomeMetric, number | null>>
): ResolvedStat[] {
  return stats.flatMap((stat) => {
    const value =
      stat.metric === "MANUAL"
        ? stat.value?.trim() || null
        : (formatMetric(stat.metric, metrics[stat.metric]) ?? stat.value?.trim()) || null;

    return value ? [{ id: stat.id, label: stat.title, value }] : [];
  });
}

// ---------------------------------------------------------------------------
// READS
// ---------------------------------------------------------------------------

/**
 * Everything the public landing page renders.
 *
 * Read-only by design: with no `home_page` row this returns HOME_DEFAULTS rather than
 * creating one, so an anonymous page view never writes to the database.
 */
export async function loadHomeContent(): Promise<HomeContent> {
  const [row, blocks] = await Promise.all([
    prisma.homePage.findUnique({ where: { id: HOME_ID } }),
    prisma.homeBlock.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const grouped = groupByKind(blocks);
  const needed = new Set(grouped.STAT.map((stat) => stat.metric).filter((m) => m !== "MANUAL"));
  const metrics = needed.size > 0 ? await computeMetrics(needed) : {};

  return {
    settings: row ? toSettings(row) : HOME_DEFAULTS,
    blocks: grouped,
    stats: resolveStats(grouped.STAT, metrics),
  };
}

/** The editor's view: every block, including the ones toggled off. */
export async function loadHomeAdmin(): Promise<HomeAdminContent> {
  const [row, blocks, metricValues] = await Promise.all([
    prisma.homePage.findUnique({
      where: { id: HOME_ID },
      include: { updatedBy: { select: { name: true } } },
    }),
    prisma.homeBlock.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    computeMetrics(new Set<HomeMetric>(["STUDENTS", "SUBJECTS", "QUESTIONS", "ATTEMPTS", "PASS_RATE", "AVERAGE_SCORE"])),
  ]);

  return {
    settings: row ? toSettings(row) : HOME_DEFAULTS,
    blocks: groupByKind(blocks),
    updatedAt: row?.updatedAt ?? null,
    updatedByName: row?.updatedBy?.name ?? null,
    metrics: {
      STUDENTS: formatMetric("STUDENTS", metricValues.STUDENTS),
      SUBJECTS: formatMetric("SUBJECTS", metricValues.SUBJECTS),
      QUESTIONS: formatMetric("QUESTIONS", metricValues.QUESTIONS),
      ATTEMPTS: formatMetric("ATTEMPTS", metricValues.ATTEMPTS),
      PASS_RATE: formatMetric("PASS_RATE", metricValues.PASS_RATE),
      AVERAGE_SCORE: formatMetric("AVERAGE_SCORE", metricValues.AVERAGE_SCORE),
    },
  };
}

function toSettings(row: HomePage): HomeSettings {
  const { id, updatedById, createdAt, updatedAt, ...settings } = row;
  return settings;
}

// ---------------------------------------------------------------------------
// WRITES
// ---------------------------------------------------------------------------

/**
 * Applies a partial settings update.
 *
 * Upsert rather than update: the row is created lazily on the first save, filling anything
 * the admin didn't touch from HOME_DEFAULTS so the created row is always complete.
 */
export async function saveHomeSettings(
  data: Partial<HomeSettings>,
  updatedById: string
): Promise<HomeSettings> {
  const row = await prisma.homePage.upsert({
    where: { id: HOME_ID },
    create: { id: HOME_ID, ...HOME_DEFAULTS, ...data, updatedById },
    update: { ...data, updatedById },
  });

  return toSettings(row);
}

/** Appends a block to the end of its own kind's list. */
export async function createHomeBlock(
  data: Omit<Prisma.HomeBlockUncheckedCreateInput, "order">
): Promise<HomeBlock> {
  const last = await prisma.homeBlock.findFirst({
    where: { kind: data.kind },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  return prisma.homeBlock.create({
    data: { ...data, order: (last?.order ?? -1) + 1 },
  });
}

/**
 * Rewrites the ordering of one kind from a list of ids.
 *
 * Ids that don't belong to `kind` are ignored, and blocks the caller left out keep their
 * position after the ones it listed — so a stale editor tab can't silently drop a block
 * that was added from somewhere else.
 */
export async function reorderHomeBlocks(kind: HomeBlockKind, ids: string[]): Promise<void> {
  const existing = await prisma.homeBlock.findMany({
    where: { kind },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  const known = new Set(existing.map((block) => block.id));
  const listed = ids.filter((id) => known.has(id));
  const rest = existing.map((block) => block.id).filter((id) => !listed.includes(id));
  const ordered = [...listed, ...rest];

  await prisma.$transaction(
    ordered.map((id, index) =>
      prisma.homeBlock.update({ where: { id }, data: { order: index } })
    )
  );
}

export { KINDS as HOME_BLOCK_KINDS };
