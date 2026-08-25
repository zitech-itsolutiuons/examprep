/**
 * ExamPrep seed data.
 *
 * Re-runnable: users, subjects, and topics are upserted, questions are matched by
 * (subject, text), and demo attempts are only created for a student who has none for
 * that subject. Running `npm run db:seed` twice leaves the same database.
 *
 * Demo results are produced by calling the real `gradeAndSubmitAttempt`, not by writing
 * scores by hand — so seeded results, `UserProgress`, and admin analytics are exactly
 * what the running application would compute.
 */

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { startOrResumeAttempt } from "@/server/services/attempts";
import { gradeAndSubmitAttempt, recalculateProgress } from "@/server/services/grading";
import {
  HOME_DEFAULTS,
  HOME_DEFAULT_BLOCKS,
  HOME_ID,
  HOME_BLOCK_KINDS,
} from "@/server/services/home";
import { getActiveCode } from "@/server/services/guest-access";

// ---------------------------------------------------------------------------
// CONTENT
// ---------------------------------------------------------------------------

type SeedQuestion = {
  text: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topic?: string;
  points?: number;
  explanation: string;
  options: { text: string; isCorrect: boolean }[];
};

type SeedSubject = {
  title: string;
  slug: string;
  description: string;
  durationMin: number;
  passMark: number;
  isPublished: boolean;
  isActive: boolean;
  topics: string[];
  questions: SeedQuestion[];
};

const TRUE_FALSE = (answer: boolean) => [
  { text: "True", isCorrect: answer },
  { text: "False", isCorrect: !answer },
];

const SUBJECTS: SeedSubject[] = [
  {
    title: "General Mathematics",
    slug: "general-mathematics",
    description:
      "Core secondary-school mathematics: algebra, geometry, and number work, in exam conditions.",
    durationMin: 30,
    passMark: 50,
    isPublished: true,
    isActive: true,
    topics: ["Algebra", "Geometry", "Number & Numeration"],
    questions: [
      {
        text: "Solve for x: 3x + 7 = 22",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Algebra",
        explanation:
          "Subtract 7 from both sides to get 3x = 15, then divide both sides by 3, giving x = 5.",
        options: [
          { text: "x = 3", isCorrect: false },
          { text: "x = 5", isCorrect: true },
          { text: "x = 7", isCorrect: false },
          { text: "x = 9", isCorrect: false },
        ],
      },
      {
        text: "Simplify: (2x³)(5x⁴)",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Algebra",
        explanation:
          "Multiply the coefficients (2 × 5 = 10) and add the indices (x³ × x⁴ = x⁷), giving 10x⁷.",
        options: [
          { text: "7x⁷", isCorrect: false },
          { text: "10x¹²", isCorrect: false },
          { text: "10x⁷", isCorrect: true },
          { text: "7x¹²", isCorrect: false },
        ],
      },
      {
        text: "Factorise completely: x² − 9x + 20",
        type: "SINGLE_CHOICE",
        difficulty: "HARD",
        topic: "Algebra",
        points: 2,
        explanation:
          "Find two numbers multiplying to +20 and adding to −9: those are −4 and −5. So the factors are (x − 4)(x − 5).",
        options: [
          { text: "(x − 4)(x − 5)", isCorrect: true },
          { text: "(x + 4)(x + 5)", isCorrect: false },
          { text: "(x − 2)(x − 10)", isCorrect: false },
          { text: "(x − 1)(x − 20)", isCorrect: false },
        ],
      },
      {
        text: "The interior angles of any triangle add up to 180°.",
        type: "TRUE_FALSE",
        difficulty: "EASY",
        topic: "Geometry",
        explanation:
          "True. This holds for every triangle in plane (Euclidean) geometry, whatever its shape.",
        options: TRUE_FALSE(true),
      },
      {
        text: "A rectangle is 12 cm long and 5 cm wide. What is its perimeter?",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Geometry",
        explanation:
          "Perimeter = 2(length + width) = 2(12 + 5) = 34 cm. Note that 60 cm² is the area, not the perimeter.",
        options: [
          { text: "17 cm", isCorrect: false },
          { text: "34 cm", isCorrect: true },
          { text: "60 cm", isCorrect: false },
          { text: "24 cm", isCorrect: false },
        ],
      },
      {
        text: "Find the area of a circle of radius 7 cm. (Take π = 22/7)",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Geometry",
        explanation:
          "Area = πr² = (22/7) × 7 × 7 = 154 cm². 44 cm is the circumference, so watch which formula the question asks for.",
        options: [
          { text: "44 cm²", isCorrect: false },
          { text: "154 cm²", isCorrect: true },
          { text: "22 cm²", isCorrect: false },
          { text: "308 cm²", isCorrect: false },
        ],
      },
      {
        text: "Which of the following numbers are prime? (Select all that apply)",
        type: "MULTIPLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Number & Numeration",
        points: 2,
        explanation:
          "2 and 17 are prime. 9 = 3 × 3 and 21 = 3 × 7, so both are composite. 2 is the only even prime number.",
        options: [
          { text: "2", isCorrect: true },
          { text: "9", isCorrect: false },
          { text: "17", isCorrect: true },
          { text: "21", isCorrect: false },
        ],
      },
      {
        text: "What is 15% of 240?",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Number & Numeration",
        explanation: "15% of 240 = 0.15 × 240 = 36. (10% is 24, and half of that is 12; 24 + 12 = 36.)",
        options: [
          { text: "24", isCorrect: false },
          { text: "36", isCorrect: true },
          { text: "48", isCorrect: false },
          { text: "16", isCorrect: false },
        ],
      },
      {
        text: "Find the value of x if 2ˣ = 32",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Number & Numeration",
        explanation: "32 = 2⁵, so 2ˣ = 2⁵ and therefore x = 5.",
        options: [
          { text: "4", isCorrect: false },
          { text: "5", isCorrect: true },
          { text: "6", isCorrect: false },
          { text: "16", isCorrect: false },
        ],
      },
      {
        text: "Find the median of: 4, 8, 6, 5, 3, 8, 2",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Number & Numeration",
        explanation:
          "Sort the values first: 2, 3, 4, 5, 6, 8, 8. With seven values the median is the 4th, which is 5. (8 is the mode.)",
        options: [
          { text: "4", isCorrect: false },
          { text: "5", isCorrect: true },
          { text: "6", isCorrect: false },
          { text: "8", isCorrect: false },
        ],
      },
    ],
  },
  {
    title: "English Language",
    slug: "english-language",
    description:
      "Grammar, vocabulary, and comprehension practice in the style of a standard English paper.",
    durationMin: 25,
    passMark: 50,
    isPublished: true,
    isActive: true,
    topics: ["Grammar", "Vocabulary", "Comprehension"],
    questions: [
      {
        text: "Choose the correct option: She ______ to school every morning.",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Grammar",
        explanation:
          "\"She\" is third-person singular, so the present-simple verb takes an -s: \"goes\".",
        options: [
          { text: "go", isCorrect: false },
          { text: "goes", isCorrect: true },
          { text: "going", isCorrect: false },
          { text: "gone", isCorrect: false },
        ],
      },
      {
        text: "What is the plural of \"criterion\"?",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Grammar",
        explanation:
          "\"Criterion\" is Greek in origin and pluralises to \"criteria\". Note that \"criteria\" is already plural, so \"a criteria\" is incorrect.",
        options: [
          { text: "criterions", isCorrect: false },
          { text: "criteria", isCorrect: true },
          { text: "criterias", isCorrect: false },
          { text: "criterium", isCorrect: false },
        ],
      },
      {
        text: "Identify the adverb: \"He spoke softly to the frightened child.\"",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Grammar",
        explanation:
          "\"Softly\" modifies the verb \"spoke\", which makes it an adverb. \"Frightened\" describes the child, so it is an adjective there.",
        options: [
          { text: "spoke", isCorrect: false },
          { text: "softly", isCorrect: true },
          { text: "frightened", isCorrect: false },
          { text: "child", isCorrect: false },
        ],
      },
      {
        text: "Which of the following are conjunctions? (Select all that apply)",
        type: "MULTIPLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Grammar",
        points: 2,
        explanation:
          "\"Although\" and \"because\" join clauses, so both are conjunctions. \"Quickly\" is an adverb and \"beautiful\" is an adjective.",
        options: [
          { text: "although", isCorrect: true },
          { text: "quickly", isCorrect: false },
          { text: "because", isCorrect: true },
          { text: "beautiful", isCorrect: false },
        ],
      },
      {
        text: "Complete correctly: Neither of the boys ______ present at the assembly.",
        type: "SINGLE_CHOICE",
        difficulty: "HARD",
        topic: "Grammar",
        points: 2,
        explanation:
          "\"Neither\" is singular, so it takes a singular verb: \"was\". The plural noun \"boys\" sits inside the phrase \"of the boys\" and does not control the verb.",
        options: [
          { text: "were", isCorrect: false },
          { text: "was", isCorrect: true },
          { text: "are", isCorrect: false },
          { text: "have been", isCorrect: false },
        ],
      },
      {
        text: "Rewrite in the passive voice: \"The teacher marked the scripts.\"",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Grammar",
        explanation:
          "In the passive, the object becomes the subject: \"The scripts were marked by the teacher.\" The tense stays in the past.",
        options: [
          { text: "The scripts were marked by the teacher.", isCorrect: true },
          { text: "The scripts are marked by the teacher.", isCorrect: false },
          { text: "The teacher was marking the scripts.", isCorrect: false },
          { text: "The scripts had been marking by the teacher.", isCorrect: false },
        ],
      },
      {
        text: "\"Their\" and \"there\" are homophones.",
        type: "TRUE_FALSE",
        difficulty: "EASY",
        topic: "Vocabulary",
        explanation:
          "True. Homophones sound alike but differ in meaning and spelling — \"their\" shows possession, \"there\" indicates place.",
        options: TRUE_FALSE(true),
      },
      {
        text: "Choose the word most nearly opposite in meaning to \"scarce\".",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Vocabulary",
        explanation:
          "\"Scarce\" means in short supply, so its opposite is \"abundant\". \"Rare\" and \"limited\" are near-synonyms, not antonyms.",
        options: [
          { text: "rare", isCorrect: false },
          { text: "abundant", isCorrect: true },
          { text: "limited", isCorrect: false },
          { text: "hidden", isCorrect: false },
        ],
      },
      {
        text: "Choose the word closest in meaning to \"meticulous\".",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Vocabulary",
        explanation:
          "\"Meticulous\" means showing great attention to detail, so \"painstaking\" is closest. It does not mean slow or anxious.",
        options: [
          { text: "careless", isCorrect: false },
          { text: "painstaking", isCorrect: true },
          { text: "hurried", isCorrect: false },
          { text: "generous", isCorrect: false },
        ],
      },
      {
        text: "What does the proverb \"A stitch in time saves nine\" mean?",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Comprehension",
        explanation:
          "It advises dealing with a small problem promptly so it does not grow into a much larger one. It is about timeliness, not about sewing or thrift.",
        options: [
          { text: "Tackling a problem early prevents bigger trouble later.", isCorrect: true },
          { text: "Nine people work faster than one.", isCorrect: false },
          { text: "Time spent sewing is never wasted.", isCorrect: false },
          { text: "Saving money is better than spending it.", isCorrect: false },
        ],
      },
    ],
  },
  {
    title: "Basic Computer Science",
    slug: "basic-computer-science",
    description:
      "Computer fundamentals: hardware, software, and staying safe online. Higher pass mark than the other papers.",
    durationMin: 20,
    passMark: 60,
    isPublished: true,
    isActive: true,
    topics: ["Hardware", "Software", "Internet & Safety"],
    questions: [
      {
        text: "What does CPU stand for?",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Hardware",
        explanation:
          "CPU stands for Central Processing Unit — the component that executes instructions and is often called the computer's brain.",
        options: [
          { text: "Central Processing Unit", isCorrect: true },
          { text: "Computer Power Unit", isCorrect: false },
          { text: "Central Program Utility", isCorrect: false },
          { text: "Core Peripheral Unit", isCorrect: false },
        ],
      },
      {
        text: "Which of the following are input devices? (Select all that apply)",
        type: "MULTIPLE_CHOICE",
        difficulty: "EASY",
        topic: "Hardware",
        points: 2,
        explanation:
          "A keyboard and a mouse both send data into the computer, so they are input devices. A monitor and a printer receive data from it, making them output devices.",
        options: [
          { text: "Keyboard", isCorrect: true },
          { text: "Monitor", isCorrect: false },
          { text: "Mouse", isCorrect: true },
          { text: "Printer", isCorrect: false },
        ],
      },
      {
        text: "RAM loses its contents when the computer is switched off.",
        type: "TRUE_FALSE",
        difficulty: "EASY",
        topic: "Hardware",
        explanation:
          "True. RAM is volatile memory, which is why unsaved work is lost in a power cut. Storage such as an SSD is non-volatile.",
        options: TRUE_FALSE(true),
      },
      {
        text: "Which type of storage keeps data when the power is removed?",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Hardware",
        explanation:
          "An SSD is non-volatile, so it retains data without power. RAM and cache are volatile, and a CPU register holds data only momentarily during processing.",
        options: [
          { text: "RAM", isCorrect: false },
          { text: "CPU cache", isCorrect: false },
          { text: "SSD", isCorrect: true },
          { text: "CPU register", isCorrect: false },
        ],
      },
      {
        text: "Which program translates an entire source file into machine code before it runs?",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Software",
        explanation:
          "A compiler translates the whole program ahead of execution. An interpreter translates and runs line by line, which is the key difference.",
        options: [
          { text: "Interpreter", isCorrect: false },
          { text: "Compiler", isCorrect: true },
          { text: "Assembler directive", isCorrect: false },
          { text: "Debugger", isCorrect: false },
        ],
      },
      {
        text: "Which of these is an operating system?",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Software",
        explanation:
          "Linux is an operating system. Excel and Photoshop are application software, and Chrome is a web browser that runs on top of an OS.",
        options: [
          { text: "Microsoft Excel", isCorrect: false },
          { text: "Linux", isCorrect: true },
          { text: "Adobe Photoshop", isCorrect: false },
          { text: "Google Chrome", isCorrect: false },
        ],
      },
      {
        text: "One kilobyte is exactly 1024 bytes in the binary convention.",
        type: "TRUE_FALSE",
        difficulty: "EASY",
        topic: "Software",
        explanation:
          "True in the binary convention, where 1 KB = 2¹⁰ = 1024 bytes. Storage manufacturers often use the decimal 1000 bytes instead, which is why a drive shows less capacity than advertised.",
        options: TRUE_FALSE(true),
      },
      {
        text: "What does HTTPS add to a website connection?",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Internet & Safety",
        explanation:
          "HTTPS encrypts data in transit so it cannot be read or altered on the way. It does not make a site trustworthy — a scam site can still use HTTPS.",
        options: [
          { text: "It encrypts data travelling between browser and server.", isCorrect: true },
          { text: "It guarantees the site's content is truthful.", isCorrect: false },
          { text: "It makes pages load faster.", isCorrect: false },
          { text: "It hides the website from search engines.", isCorrect: false },
        ],
      },
      {
        text: "What is phishing?",
        type: "SINGLE_CHOICE",
        difficulty: "MEDIUM",
        topic: "Internet & Safety",
        explanation:
          "Phishing tricks people into revealing passwords or card details using messages that imitate a trusted organisation. It targets the person, not a software flaw.",
        options: [
          {
            text: "Fake messages that trick people into giving away credentials.",
            isCorrect: true,
          },
          { text: "Flooding a server with traffic until it fails.", isCorrect: false },
          { text: "Guessing a password by trying every combination.", isCorrect: false },
          { text: "Copying files onto a USB drive without permission.", isCorrect: false },
        ],
      },
      {
        text: "Which practice makes a password account most secure?",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Internet & Safety",
        explanation:
          "A long, unique password per account limits the damage when one service is breached. Reusing even a complex password means one leak unlocks everything.",
        options: [
          { text: "A long, unique password for each account", isCorrect: true },
          { text: "One strong password reused everywhere", isCorrect: false },
          { text: "Your date of birth with a symbol added", isCorrect: false },
          { text: "A short password changed every week", isCorrect: false },
        ],
      },
    ],
  },
  {
    // Draft: proves students never see unpublished subjects.
    title: "Physics",
    slug: "physics",
    description: "Mechanics and waves. Still being written — left as a draft on purpose.",
    durationMin: 40,
    passMark: 50,
    isPublished: false,
    isActive: true,
    topics: ["Mechanics"],
    questions: [
      {
        text: "What is the SI unit of force?",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Mechanics",
        explanation: "The newton (N) is the SI unit of force, defined as 1 kg·m/s².",
        options: [
          { text: "Newton", isCorrect: true },
          { text: "Joule", isCorrect: false },
          { text: "Watt", isCorrect: false },
          { text: "Pascal", isCorrect: false },
        ],
      },
      {
        text: "Acceleration is the rate of change of velocity.",
        type: "TRUE_FALSE",
        difficulty: "EASY",
        topic: "Mechanics",
        explanation:
          "True. Acceleration measures how quickly velocity changes, so a change in direction alone still counts as acceleration.",
        options: TRUE_FALSE(true),
      },
    ],
  },
  {
    // Published but deactivated: proves the isActive filter hides it from students
    // while past results stay reviewable.
    title: "Chemistry",
    slug: "chemistry",
    description: "Atomic structure and bonding. Published but deactivated for this term.",
    durationMin: 30,
    passMark: 50,
    isPublished: true,
    isActive: false,
    topics: ["Atomic Structure"],
    questions: [
      {
        text: "What is the chemical symbol for gold?",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Atomic Structure",
        explanation: "Gold's symbol is Au, from the Latin \"aurum\". Ag is silver.",
        options: [
          { text: "Au", isCorrect: true },
          { text: "Ag", isCorrect: false },
          { text: "Gd", isCorrect: false },
          { text: "Go", isCorrect: false },
        ],
      },
      {
        text: "How many protons does a carbon atom have?",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        topic: "Atomic Structure",
        explanation:
          "Carbon's atomic number is 6, and the atomic number is the proton count. 12 is its common mass number.",
        options: [
          { text: "6", isCorrect: true },
          { text: "12", isCorrect: false },
          { text: "14", isCorrect: false },
          { text: "8", isCorrect: false },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------

const ADMIN = { name: "Ada Admin", email: "admin@examprep.app", password: "Admin@12345" };

const STUDENTS = [
  { name: "Grace Okafor", email: "grace@example.com", password: "Student@12345" },
  { name: "Daniel Mensah", email: "daniel@example.com", password: "Student@12345" },
  { name: "Amara Nwosu", email: "amara@example.com", password: "Student@12345" },
];

// ---------------------------------------------------------------------------
// DEMO ATTEMPTS
// ---------------------------------------------------------------------------

type AttemptPlan = {
  email: string;
  slug: string;
  /** Roughly the share of questions answered correctly, 0–1. */
  accuracy: number;
  /** Roughly the share left unanswered, 0–1. Applied before accuracy. */
  blankRate?: number;
  /** How long ago the attempt was submitted, for a readable trend. */
  daysAgo: number;
  timeSpentSec?: number;
  /** Left IN_PROGRESS so the "resume" path has something to show. */
  leaveOpen?: boolean;
};

// Grace improves across three maths attempts; Daniel and Amara add spread so the admin
// analytics and score distribution have something real to render.
const ATTEMPT_PLANS: AttemptPlan[] = [
  { email: "grace@example.com", slug: "general-mathematics", accuracy: 0.4, blankRate: 0.2, daysAgo: 21, timeSpentSec: 1150 },
  { email: "grace@example.com", slug: "general-mathematics", accuracy: 0.7, blankRate: 0.1, daysAgo: 12, timeSpentSec: 980 },
  { email: "grace@example.com", slug: "general-mathematics", accuracy: 0.9, daysAgo: 3, timeSpentSec: 820 },
  { email: "grace@example.com", slug: "english-language", accuracy: 0.6, daysAgo: 8, timeSpentSec: 900 },
  { email: "grace@example.com", slug: "basic-computer-science", accuracy: 0.5, daysAgo: 0, leaveOpen: true },

  { email: "daniel@example.com", slug: "general-mathematics", accuracy: 0.6, daysAgo: 15, timeSpentSec: 1400 },
  { email: "daniel@example.com", slug: "basic-computer-science", accuracy: 0.8, daysAgo: 6, timeSpentSec: 700 },
  { email: "daniel@example.com", slug: "english-language", accuracy: 0.3, blankRate: 0.2, daysAgo: 2, timeSpentSec: 1300 },

  { email: "amara@example.com", slug: "basic-computer-science", accuracy: 1, daysAgo: 9, timeSpentSec: 610 },
  { email: "amara@example.com", slug: "english-language", accuracy: 0.9, daysAgo: 4, timeSpentSec: 760 },
];

/**
 * Deterministic answer choice for a seeded attempt.
 *
 * `(index * 7) % 10` cycles through 0,7,4,1,8,5,2,9,6,3 — so correct and wrong answers
 * are spread through the paper rather than clustered at the front, and the same plan
 * always produces the same score.
 */
function planFor(index: number, accuracy: number, blankRate: number) {
  const spread = (index * 7) % 10;
  if (spread >= 10 - Math.round(blankRate * 10)) return "blank" as const;
  return spread < Math.round(accuracy * 10) ? ("correct" as const) : ("wrong" as const);
}

// ---------------------------------------------------------------------------
// CONTENT SELF-CHECK
// ---------------------------------------------------------------------------

/**
 * The seed writes questions straight through Prisma, so it bypasses the zod schema in
 * `src/server/validators/question.ts` that guards the admin UI. This re-applies those
 * same rules to the seed content, so an edit here can't create a question the admin
 * editor would refuse to save.
 *
 * It runs before any database call, which also makes it the fastest way to check the
 * content is sound without a live Postgres.
 */
function validateContent() {
  const problems: string[] = [];
  const slugs = new Set<string>();

  for (const subject of SUBJECTS) {
    const where = `subject "${subject.title}"`;

    if (slugs.has(subject.slug)) problems.push(`${where}: duplicate slug "${subject.slug}"`);
    slugs.add(subject.slug);

    if (subject.passMark < 0 || subject.passMark > 100) {
      problems.push(`${where}: passMark ${subject.passMark} is outside 0–100`);
    }
    if (subject.durationMin < 1) problems.push(`${where}: durationMin must be at least 1`);

    const topics = new Set(subject.topics);
    const seenText = new Set<string>();

    for (const question of subject.questions) {
      const at = `${where}, question "${question.text.slice(0, 40)}…"`;

      if (question.text.trim().length < 5) problems.push(`${at}: text is too short`);
      if (question.text.length > 4000) problems.push(`${at}: text exceeds 4000 characters`);

      const key = question.text.trim().toLowerCase();
      if (seenText.has(key)) problems.push(`${at}: duplicate question text within the subject`);
      seenText.add(key);

      if (question.topic && !topics.has(question.topic)) {
        problems.push(`${at}: topic "${question.topic}" is not declared on the subject`);
      }

      const points = question.points ?? 1;
      if (points < 1 || points > 100) problems.push(`${at}: points ${points} is outside 1–100`);
      if ((question.explanation ?? "").length > 4000) {
        problems.push(`${at}: explanation exceeds 4000 characters`);
      }

      if (question.options.length < 2 || question.options.length > 8) {
        problems.push(`${at}: needs between 2 and 8 options`);
      }

      const correct = question.options.filter((option) => option.isCorrect).length;
      if (correct === 0) problems.push(`${at}: no option is marked correct`);
      if (question.type !== "MULTIPLE_CHOICE" && correct > 1) {
        problems.push(`${at}: ${question.type} allows exactly one correct option`);
      }
      if (question.type === "MULTIPLE_CHOICE" && correct < 2) {
        problems.push(`${at}: MULTIPLE_CHOICE should have at least two correct options`);
      }
      if (question.type === "TRUE_FALSE" && question.options.length !== 2) {
        problems.push(`${at}: TRUE_FALSE must have exactly 2 options`);
      }

      const seenOption = new Set<string>();
      for (const option of question.options) {
        if (!option.text.trim()) problems.push(`${at}: an option has empty text`);
        const optionKey = option.text.trim().toLowerCase();
        if (seenOption.has(optionKey)) {
          problems.push(`${at}: duplicate option text "${option.text}"`);
        }
        seenOption.add(optionKey);
      }
    }
  }

  for (const plan of ATTEMPT_PLANS) {
    if (!SUBJECTS.some((subject) => subject.slug === plan.slug)) {
      problems.push(`attempt plan references unknown subject slug "${plan.slug}"`);
    } else {
      const subject = SUBJECTS.find((s) => s.slug === plan.slug)!;
      if (!subject.isPublished || !subject.isActive) {
        problems.push(
          `attempt plan targets "${plan.slug}", which is not published+active so an attempt can't start`
        );
      }
    }
    if (!STUDENTS.some((student) => student.email === plan.email)) {
      problems.push(`attempt plan references unknown student "${plan.email}"`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Seed content is invalid:\n  - ${problems.join("\n  - ")}`);
  }

  const questions = SUBJECTS.reduce((sum, subject) => sum + subject.questions.length, 0);
  console.log(`  checked:    ${SUBJECTS.length} subjects, ${questions} questions — content OK`);
}

// ---------------------------------------------------------------------------
// SEEDING
// ---------------------------------------------------------------------------

async function seedUsers() {
  const adminHash = await hashPassword(ADMIN.password);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN.email },
    create: {
      name: ADMIN.name,
      email: ADMIN.email,
      passwordHash: adminHash,
      role: "ADMIN",
      emailVerified: new Date(),
    },
    // Re-running resets the demo password but never demotes a real admin account.
    update: { passwordHash: adminHash, role: "ADMIN", isActive: true },
  });

  const students = [];
  for (const student of STUDENTS) {
    const passwordHash = await hashPassword(student.password);
    students.push(
      await prisma.user.upsert({
        where: { email: student.email },
        create: {
          name: student.name,
          email: student.email,
          passwordHash,
          role: "STUDENT",
          emailVerified: new Date(),
        },
        update: { passwordHash, isActive: true },
      })
    );
  }

  console.log(`  users:      1 admin, ${students.length} students`);
  return { admin, students };
}

async function seedContent(adminId: string) {
  let questionCount = 0;

  for (const seed of SUBJECTS) {
    const subject = await prisma.subject.upsert({
      where: { slug: seed.slug },
      create: {
        title: seed.title,
        slug: seed.slug,
        description: seed.description,
        durationMin: seed.durationMin,
        passMark: seed.passMark,
        isPublished: seed.isPublished,
        isActive: seed.isActive,
        createdById: adminId,
      },
      // Publish/active flags are refreshed so a re-run restores the intended demo state.
      update: {
        title: seed.title,
        description: seed.description,
        durationMin: seed.durationMin,
        passMark: seed.passMark,
        isPublished: seed.isPublished,
        isActive: seed.isActive,
      },
    });

    const topicIds = new Map<string, string>();
    for (const name of seed.topics) {
      const topic = await prisma.topic.upsert({
        where: { subjectId_name: { subjectId: subject.id, name } },
        create: { name, subjectId: subject.id },
        update: {},
      });
      topicIds.set(name, topic.id);
    }

    for (const question of seed.questions) {
      // Questions have no natural key, so identity is (subject, exact text). That makes
      // the seed re-runnable without inserting duplicates on every run.
      const existing = await prisma.question.findFirst({
        where: { subjectId: subject.id, text: question.text },
        select: { id: true },
      });

      if (existing) continue;

      await prisma.question.create({
        data: {
          subjectId: subject.id,
          topicId: question.topic ? topicIds.get(question.topic) ?? null : null,
          text: question.text,
          type: question.type,
          difficulty: question.difficulty,
          explanation: question.explanation,
          points: question.points ?? 1,
          isActive: true,
          createdById: adminId,
          options: {
            create: question.options.map((option, index) => ({
              text: option.text,
              isCorrect: option.isCorrect,
              order: index,
            })),
          },
        },
      });
      questionCount += 1;
    }
  }

  console.log(
    `  content:    ${SUBJECTS.length} subjects (${SUBJECTS.filter((s) => s.isPublished && s.isActive).length} live), ${questionCount} new questions`
  );
}

async function seedAttempts(studentIds: Map<string, string>) {
  let created = 0;
  let skipped = 0;
  const touched = new Set<string>();

  for (const plan of ATTEMPT_PLANS) {
    const userId = studentIds.get(plan.email);
    if (!userId) continue;

    const subject = await prisma.subject.findUnique({
      where: { slug: plan.slug },
      select: { id: true },
    });
    if (!subject) continue;

    // Each plan is the Nth attempt for that student+subject. If they already have that
    // many, this plan has run before — so re-seeding adds nothing.
    const alreadyRun = ATTEMPT_PLANS.filter(
      (other, index) =>
        other.email === plan.email &&
        other.slug === plan.slug &&
        index <= ATTEMPT_PLANS.indexOf(plan)
    ).length;

    const existing = await prisma.examAttempt.count({
      where: { userId, subjectId: subject.id },
    });
    if (existing >= alreadyRun) {
      skipped += 1;
      continue;
    }

    const started = await startOrResumeAttempt(userId, subject.id);
    if (!started.ok) continue;

    const answers = await prisma.userAnswer.findMany({
      where: { attemptId: started.attemptId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        questionId: true,
        question: {
          select: {
            type: true,
            options: { orderBy: { order: "asc" }, select: { id: true, isCorrect: true } },
          },
        },
      },
    });

    for (const [index, answer] of answers.entries()) {
      const intent = planFor(index, plan.accuracy, plan.blankRate ?? 0);
      if (intent === "blank") continue;

      const correct = answer.question.options.filter((o) => o.isCorrect).map((o) => o.id);
      const wrong = answer.question.options.filter((o) => !o.isCorrect).map((o) => o.id);

      let selected: string[];
      if (intent === "correct") {
        selected = correct;
      } else if (answer.question.type === "MULTIPLE_CHOICE" && correct.length > 1) {
        // A partial selection — wrong under all-or-nothing marking, which is worth
        // having in the demo data.
        selected = [correct[0]];
      } else {
        selected = wrong.length > 0 ? [wrong[0]] : [];
      }

      if (selected.length === 0) continue;

      await prisma.userAnswer.update({
        where: { id: answer.id },
        data: {
          selectedOptionId:
            answer.question.type === "MULTIPLE_CHOICE" ? null : selected[0] ?? null,
          selectedOptionIds: selected,
          answeredAt: new Date(),
        },
      });
    }

    // Flag a couple of questions so the review page's flag filter has data.
    for (const answer of answers.slice(1, 3)) {
      await prisma.flaggedQuestion.upsert({
        where: {
          attemptId_questionId: {
            attemptId: started.attemptId,
            questionId: answer.questionId,
          },
        },
        create: {
          attemptId: started.attemptId,
          questionId: answer.questionId,
          userId,
        },
        update: {},
      });
    }

    if (plan.leaveOpen) {
      created += 1;
      continue;
    }

    // Grade through the real service, so the stored result is genuinely what the app
    // would produce for these answers.
    await gradeAndSubmitAttempt(started.attemptId);

    // Backdate the timestamps for a readable trend, then let progress be recomputed
    // from the corrected dates below.
    const submittedAt = new Date(Date.now() - plan.daysAgo * 86_400_000);
    const timeSpentSec = plan.timeSpentSec ?? 900;
    await prisma.examAttempt.update({
      where: { id: started.attemptId },
      data: {
        submittedAt,
        startedAt: new Date(submittedAt.getTime() - timeSpentSec * 1000),
        timeSpentSec,
      },
    });

    touched.add(`${userId}:${subject.id}`);
    created += 1;
  }

  // `lastAttemptAt` was written against the pre-backdate timestamps, so recompute.
  for (const key of touched) {
    const [userId, subjectId] = key.split(":");
    await prisma.$transaction((tx) => recalculateProgress(tx, userId, subjectId));
  }

  console.log(
    `  attempts:   ${created} created${skipped > 0 ? `, ${skipped} already present` : ""}`
  );
}

/**
 * Landing-page copy.
 *
 * The settings row is upserted from HOME_DEFAULTS, but each block list is only populated
 * when it is completely empty — so re-running the seed restores the shipped wording without
 * duplicating, or overwriting, blocks an admin has since edited in the UI.
 */
async function seedHomePage() {
  await prisma.homePage.upsert({
    where: { id: HOME_ID },
    create: { id: HOME_ID, ...HOME_DEFAULTS },
    update: {},
  });

  let created = 0;

  for (const kind of HOME_BLOCK_KINDS) {
    const existing = await prisma.homeBlock.count({ where: { kind } });
    if (existing > 0) continue;

    const defaults = HOME_DEFAULT_BLOCKS[kind];
    await prisma.homeBlock.createMany({
      data: defaults.map((block, index) => ({ ...block, kind, order: index })),
    });
    created += defaults.length;
  }

  console.log(
    `  home page:  settings ready${created > 0 ? `, ${created} blocks created` : ", blocks already present"}`
  );
}

/**
 * Ensures the guest access-code row exists and reports the current code.
 *
 * `getActiveCode` creates the row on first read and rolls it when the 12-hour window has
 * elapsed, so calling it here is all the seeding this needs — and it prints the code, which
 * is otherwise only visible at /admin/access.
 */
async function seedGuestAccess() {
  const active = await getActiveCode();
  const hours = Math.max(0, Math.round((active.expiresAt.getTime() - Date.now()) / 3_600_000));

  console.log(
    `  guest code: ${active.code} (${active.isEnabled ? "enabled" : "disabled"}, ~${hours}h left)`
  );
}

async function main() {
  console.log("\nSeeding ExamPrep…\n");

  // Fails fast, before touching the database.
  validateContent();

  const { admin, students } = await seedUsers();
  await seedContent(admin.id);
  await seedHomePage();
  await seedGuestAccess();
  await seedAttempts(new Map(students.map((student) => [student.email, student.id])));

  console.log("\nSign in with:");
  console.log(`  Admin    ${ADMIN.email} / ${ADMIN.password}`);
  console.log(`  Student  ${STUDENTS[0].email} / ${STUDENTS[0].password}`);
  console.log("\nDone.\n");
}

main()
  .catch((error) => {
    console.error("\nSeed failed:\n", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
