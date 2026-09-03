import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { connectToDatabase, mongoose } from "@/lib/mongoose";
import { requireApiAdmin } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/api";
import { QuestionModel, QuestionOptionModel, SubjectModel, TopicModel } from "@/models";
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

  await connectToDatabase();

  const subject = await SubjectModel.findOne({ _id: params.id }).select("title").lean();
  if (!subject) return notFound("Subject");

  const subjectId = String(subject._id);

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
  const existing = await QuestionModel.find({ subjectId }).select("text").lean();
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

  // The whole import is one transaction, as it was under Prisma: a partially imported file
  // would leave the admin no way to tell which rows landed.
  const session = await mongoose.startSession();
  let topicsCreated = 0;

  try {
    await session.withTransaction(async () => {
      topicsCreated = 0;

      // Resolve topic names to ids, creating any that don't exist yet in this subject.
      const wanted = [...new Set(toImport.map((q) => q.topicName).filter((n): n is string => !!n))];
      const topicIds = new Map<string, string>();

      if (wanted.length > 0) {
        const found = await TopicModel.find({ subjectId })
          .select("name")
          .session(session)
          .lean();
        for (const topic of found) topicIds.set(topic.name.toLowerCase(), String(topic._id));

        for (const name of wanted) {
          if (topicIds.has(name.toLowerCase())) continue;
          const [created] = await TopicModel.create([{ subjectId, name }], { session });
          topicIds.set(created.name.toLowerCase(), String(created._id));
          topicsCreated++;
        }
      }

      // Built as two bulk inserts rather than a create-per-row: a 1000-question file would
      // otherwise be 2000 sequential round trips inside one transaction. The ids are minted
      // here (the same `randomUUID` the schema default uses) so the options can point at
      // their question without waiting for the insert to hand ids back.
      const questionDocs = toImport.map((question) => ({
        _id: randomUUID(),
        subjectId,
        topicId: question.topicName
          ? topicIds.get(question.topicName.toLowerCase()) ?? null
          : null,
        text: question.text,
        type: question.type,
        difficulty: question.difficulty,
        explanation: question.explanation,
        points: question.points,
        isActive: true,
        createdById: auth.user!.id,
      }));

      const optionDocs = toImport.flatMap((question, index) =>
        question.options.map((option, order) => ({
          questionId: questionDocs[index]._id,
          text: option.text,
          isCorrect: option.isCorrect,
          order,
        }))
      );

      await QuestionModel.insertMany(questionDocs, { session });
      await QuestionOptionModel.insertMany(optionDocs, { session });
    });
  } finally {
    await session.endSession();
  }

  await writeAudit({
    userId: auth.user.id,
    action: "question.import",
    entity: "Subject",
    entityId: subjectId,
    metadata: {
      imported: toImport.length,
      skipped: skipped.length,
      topicsCreated,
    },
  });

  return NextResponse.json({
    imported: toImport.length,
    skipped: skipped.map((question) => ({ line: question.line, text: question.text })),
    topicsCreated,
  });
}
