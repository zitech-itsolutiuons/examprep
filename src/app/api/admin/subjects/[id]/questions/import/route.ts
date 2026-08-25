import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/api";
import { parseQuestionCsv } from "@/server/services/question-import";
import { writeAudit } from "@/server/services/audit";

type Params = { params: { id: string } };

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_ROWS = 1000;

/** Accepts either a multipart upload (field `file`) or a JSON body `{ csv }`. */
async function readCsv(req: Request): Promise<{ csv?: string; error?: string }> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return { error: "No file was uploaded." };
    if (file.size > MAX_BYTES) return { error: "That file is larger than 2 MB." };
    return { csv: await file.text() };
  }

  const body = (await req.json().catch(() => null)) as { csv?: unknown } | null;
  if (typeof body?.csv !== "string") return { error: "Provide the CSV text in a `csv` field." };
  if (body.csv.length > MAX_BYTES) return { error: "That file is larger than 2 MB." };
  return { csv: body.csv };
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;

  const subject = await prisma.subject.findUnique({
    where: { id: params.id },
    select: { id: true, title: true },
  });
  if (!subject) return notFound("Subject");

  const { csv, error: readError } = await readCsv(req);
  if (!csv) return badRequest(readError ?? "Could not read the upload.");

  const { questions, errors } = parseQuestionCsv(csv);

  // Nothing is written when any row is malformed — a half-imported bank is worse than none.
  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: `${errors.length} row${errors.length === 1 ? "" : "s"} could not be imported. Fix them and upload again.`,
        rowErrors: errors.slice(0, 50),
        totalErrors: errors.length,
      },
      { status: 400 }
    );
  }

  if (questions.length === 0) return badRequest("No question rows were found in that file.");
  if (questions.length > MAX_ROWS) {
    return badRequest(`Import at most ${MAX_ROWS} questions at a time (found ${questions.length}).`);
  }

  // Rows whose text already exists in this subject are reported, not duplicated.
  const existing = await prisma.question.findMany({
    where: { subjectId: subject.id },
    select: { text: true },
  });
  const existingText = new Set(existing.map((question) => question.text.trim().toLowerCase()));

  const skipped = questions.filter((question) => existingText.has(question.text.toLowerCase()));
  const toImport = questions.filter((question) => !existingText.has(question.text.toLowerCase()));

  if (toImport.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: skipped.map((question) => ({ line: question.line, text: question.text })),
      topicsCreated: 0,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Resolve topic names to ids, creating any that don't exist yet in this subject.
    const wanted = [...new Set(toImport.map((q) => q.topicName).filter((n): n is string => !!n))];
    const topicIds = new Map<string, string>();
    let topicsCreated = 0;

    if (wanted.length > 0) {
      const found = await tx.topic.findMany({
        where: { subjectId: subject.id },
        select: { id: true, name: true },
      });
      for (const topic of found) topicIds.set(topic.name.toLowerCase(), topic.id);

      for (const name of wanted) {
        if (topicIds.has(name.toLowerCase())) continue;
        const created = await tx.topic.create({
          data: { subjectId: subject.id, name },
          select: { id: true, name: true },
        });
        topicIds.set(created.name.toLowerCase(), created.id);
        topicsCreated++;
      }
    }

    for (const question of toImport) {
      await tx.question.create({
        data: {
          subjectId: subject.id,
          topicId: question.topicName
            ? topicIds.get(question.topicName.toLowerCase()) ?? null
            : null,
          text: question.text,
          type: question.type,
          difficulty: question.difficulty,
          explanation: question.explanation,
          points: question.points,
          isActive: true,
          createdById: auth.user.id,
          options: {
            create: question.options.map((option, index) => ({
              text: option.text,
              isCorrect: option.isCorrect,
              order: index,
            })),
          },
        },
      });
    }

    return { topicsCreated };
  });

  await writeAudit({
    userId: auth.user.id,
    action: "question.import",
    entity: "Subject",
    entityId: subject.id,
    metadata: {
      imported: toImport.length,
      skipped: skipped.length,
      topicsCreated: result.topicsCreated,
    },
  });

  return NextResponse.json({
    imported: toImport.length,
    skipped: skipped.map((question) => ({ line: question.line, text: question.text })),
    topicsCreated: result.topicsCreated,
  });
}
