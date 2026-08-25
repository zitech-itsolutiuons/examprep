import { normaliseHeader, parseCsv } from "@/lib/csv";

export type ImportedOption = { text: string; isCorrect: boolean };

export type ImportedQuestion = {
  /** 1-based line number in the uploaded file, used to report errors back to the admin. */
  line: number;
  text: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  difficulty: "EASY" | "MEDIUM" | "HARD";
  explanation: string | null;
  points: number;
  topicName: string | null;
  options: ImportedOption[];
};

export type ImportRowError = { line: number; message: string };

export type ImportParseResult = {
  questions: ImportedQuestion[];
  errors: ImportRowError[];
};

/** Column aliases accepted in the header row. */
const FIELD_ALIASES: Record<string, string[]> = {
  question: ["question", "questiontext", "text", "prompt"],
  correct: ["correct", "correctanswer", "correctoption", "answer", "answers"],
  explanation: ["explanation", "correction", "rationale", "reason"],
  topic: ["topic", "category", "section"],
  difficulty: ["difficulty", "level"],
  points: ["points", "point", "mark", "marks", "score"],
  type: ["type", "questiontype"],
};

const OPTION_LETTERS = ["a", "b", "c", "d", "e", "f", "g", "h"];

const TYPE_ALIASES: Record<string, ImportedQuestion["type"]> = {
  single: "SINGLE_CHOICE",
  singlechoice: "SINGLE_CHOICE",
  singleanswer: "SINGLE_CHOICE",
  radio: "SINGLE_CHOICE",
  multiple: "MULTIPLE_CHOICE",
  multiplechoice: "MULTIPLE_CHOICE",
  multipleanswer: "MULTIPLE_CHOICE",
  multi: "MULTIPLE_CHOICE",
  checkbox: "MULTIPLE_CHOICE",
  truefalse: "TRUE_FALSE",
  boolean: "TRUE_FALSE",
  tf: "TRUE_FALSE",
};

const DIFFICULTY_ALIASES: Record<string, ImportedQuestion["difficulty"]> = {
  easy: "EASY",
  simple: "EASY",
  basic: "EASY",
  medium: "MEDIUM",
  moderate: "MEDIUM",
  normal: "MEDIUM",
  hard: "HARD",
  difficult: "HARD",
  advanced: "HARD",
};

/** The header ExamPrep writes when an admin downloads the template. */
export const CSV_TEMPLATE_HEADERS = [
  "question",
  "optionA",
  "optionB",
  "optionC",
  "optionD",
  "correct",
  "explanation",
  "topic",
  "difficulty",
  "points",
  "type",
];

export const CSV_TEMPLATE = [
  CSV_TEMPLATE_HEADERS.join(","),
  '"Which planet is closest to the Sun?",Mercury,Venus,Earth,Mars,A,"Mercury orbits nearest the Sun.",Astronomy,EASY,1,SINGLE_CHOICE',
  '"Select every prime number.",2,4,7,9,"A|C","2 and 7 have no divisors other than 1 and themselves.",Numbers,MEDIUM,2,MULTIPLE_CHOICE',
  '"Water boils at 100°C at sea level.",True,False,,,A,"At 1 atm the boiling point is 100°C.",Physics,EASY,1,TRUE_FALSE',
].join("\n");

type ColumnMap = {
  question: number;
  correct: number;
  explanation: number;
  topic: number;
  difficulty: number;
  points: number;
  type: number;
  /** Option column indexes in display order. */
  options: number[];
};

function mapColumns(header: string[]): { columns?: ColumnMap; error?: string } {
  const normalised = header.map(normaliseHeader);
  const find = (aliases: string[]) => normalised.findIndex((cell) => aliases.includes(cell));

  const optionColumns: { index: number; sort: number }[] = [];
  normalised.forEach((cell, index) => {
    // `optionA`…`optionH`, `option1`…`option8`, or a bare `a`…`h` column.
    const letterMatch = /^option([a-h])$/.exec(cell) ?? /^([a-h])$/.exec(cell);
    if (letterMatch) {
      optionColumns.push({ index, sort: OPTION_LETTERS.indexOf(letterMatch[1]) });
      return;
    }
    const numberMatch = /^option([1-8])$/.exec(cell);
    if (numberMatch) {
      optionColumns.push({ index, sort: Number(numberMatch[1]) - 1 });
    }
  });

  const question = find(FIELD_ALIASES.question);
  if (question === -1) {
    return { error: 'Missing a "question" column in the header row.' };
  }
  if (optionColumns.length < 2) {
    return { error: 'Add at least two option columns, e.g. "optionA" and "optionB".' };
  }

  const correct = find(FIELD_ALIASES.correct);
  if (correct === -1) {
    return { error: 'Missing a "correct" column in the header row.' };
  }

  return {
    columns: {
      question,
      correct,
      explanation: find(FIELD_ALIASES.explanation),
      topic: find(FIELD_ALIASES.topic),
      difficulty: find(FIELD_ALIASES.difficulty),
      points: find(FIELD_ALIASES.points),
      type: find(FIELD_ALIASES.type),
      options: optionColumns.sort((a, b) => a.sort - b.sort).map((column) => column.index),
    },
  };
}

function cell(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? "").trim() : "";
}

/**
 * Resolves the `correct` cell against the option list. Accepts letters (`A`, `b`),
 * 1-based positions (`1`, `2`), or the option text itself, and any of `|,;/` as the
 * separator when a question has several correct answers.
 */
function resolveCorrect(raw: string, options: string[]): { indexes?: number[]; error?: string } {
  const tokens = raw
    .split(/[|;,/]/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return { error: "No correct answer given." };

  const indexes = new Set<number>();

  for (const token of tokens) {
    const lower = token.toLowerCase();

    if (/^[a-h]$/.test(lower)) {
      const index = OPTION_LETTERS.indexOf(lower);
      if (index >= options.length) {
        return { error: `Correct answer "${token}" points past the last option.` };
      }
      indexes.add(index);
      continue;
    }

    if (/^[1-8]$/.test(lower)) {
      const index = Number(lower) - 1;
      if (index >= options.length) {
        return { error: `Correct answer "${token}" points past the last option.` };
      }
      indexes.add(index);
      continue;
    }

    const byText = options.findIndex((option) => option.toLowerCase() === lower);
    if (byText === -1) {
      return { error: `Correct answer "${token}" doesn't match any option.` };
    }
    indexes.add(byText);
  }

  return { indexes: [...indexes].sort((a, b) => a - b) };
}

function inferType(options: string[], correctCount: number): ImportedQuestion["type"] {
  if (correctCount > 1) return "MULTIPLE_CHOICE";
  const looksBoolean =
    options.length === 2 &&
    ["true", "false"].includes(options[0].toLowerCase()) &&
    ["true", "false"].includes(options[1].toLowerCase());
  return looksBoolean ? "TRUE_FALSE" : "SINGLE_CHOICE";
}

/**
 * Turns raw CSV text into validated question rows. Row-level problems are collected rather
 * than thrown so the admin sees every bad line at once; the caller decides whether to
 * import anything when `errors` is non-empty.
 */
export function parseQuestionCsv(csv: string): ImportParseResult {
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return { questions: [], errors: [{ line: 0, message: "The file is empty." }] };
  }

  const { columns, error } = mapColumns(rows[0]);
  if (!columns) {
    return { questions: [], errors: [{ line: 1, message: error ?? "Unreadable header row." }] };
  }

  const questions: ImportedQuestion[] = [];
  const errors: ImportRowError[] = [];
  const seenText = new Set<string>();

  rows.slice(1).forEach((row, rowIndex) => {
    const line = rowIndex + 2; // header is line 1
    const text = cell(row, columns.question);

    if (text.length < 5) {
      errors.push({ line, message: "Question text must be at least 5 characters." });
      return;
    }

    const key = text.toLowerCase();
    if (seenText.has(key)) {
      errors.push({ line, message: "Duplicate question — the same text appears earlier in the file." });
      return;
    }
    seenText.add(key);

    const optionTexts = columns.options.map((index) => cell(row, index)).filter(Boolean);
    if (optionTexts.length < 2) {
      errors.push({ line, message: "At least two options are required." });
      return;
    }
    if (optionTexts.length > 8) {
      errors.push({ line, message: "At most eight options are allowed." });
      return;
    }
    if (new Set(optionTexts.map((option) => option.toLowerCase())).size !== optionTexts.length) {
      errors.push({ line, message: "Two options have the same text." });
      return;
    }
    const tooLong = optionTexts.find((option) => option.length > 500);
    if (tooLong) {
      errors.push({ line, message: "An option is longer than 500 characters." });
      return;
    }

    const resolved = resolveCorrect(cell(row, columns.correct), optionTexts);
    if (!resolved.indexes) {
      errors.push({ line, message: resolved.error ?? "Unreadable correct answer." });
      return;
    }

    const rawType = normaliseHeader(cell(row, columns.type));
    const type = rawType
      ? TYPE_ALIASES[rawType] ?? inferType(optionTexts, resolved.indexes.length)
      : inferType(optionTexts, resolved.indexes.length);

    if (type !== "MULTIPLE_CHOICE" && resolved.indexes.length > 1) {
      errors.push({
        line,
        message: "Several correct answers given, but the type only allows one. Use MULTIPLE_CHOICE.",
      });
      return;
    }
    if (type === "TRUE_FALSE" && optionTexts.length !== 2) {
      errors.push({ line, message: "True/false questions need exactly two options." });
      return;
    }

    const rawDifficulty = normaliseHeader(cell(row, columns.difficulty));
    const difficulty = rawDifficulty ? DIFFICULTY_ALIASES[rawDifficulty] : undefined;
    if (rawDifficulty && !difficulty) {
      errors.push({ line, message: `Unknown difficulty "${cell(row, columns.difficulty)}".` });
      return;
    }

    const rawPoints = cell(row, columns.points);
    let points = 1;
    if (rawPoints) {
      points = Number(rawPoints);
      if (!Number.isInteger(points) || points < 1 || points > 100) {
        errors.push({ line, message: `Points must be a whole number from 1 to 100.` });
        return;
      }
    }

    const explanation = cell(row, columns.explanation);
    const topicName = cell(row, columns.topic);

    questions.push({
      line,
      text,
      type,
      difficulty: difficulty ?? "MEDIUM",
      explanation: explanation ? explanation.slice(0, 4000) : null,
      points,
      topicName: topicName ? topicName.slice(0, 100) : null,
      options: optionTexts.map((option, index) => ({
        text: option,
        isCorrect: resolved.indexes!.includes(index),
      })),
    });
  });

  return { questions, errors };
}
