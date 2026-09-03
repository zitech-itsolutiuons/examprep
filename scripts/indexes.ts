import "./env";

import { connectToDatabase, mongoose } from "@/lib/mongoose";

// Importing for the side effect: the module body registers every schema on the connection,
// which is what makes `mongoose.models` below non-empty.
import "@/models";

/**
 * Builds the indexes the schemas declare, and prints what the database actually has.
 *
 * WHY A SCRIPT RATHER THAN TRUSTING AUTO-INDEXING: Mongoose creates declared indexes on
 * first use of each model, which is enough in development but has two problems in
 * production. It happens on a request's critical path after a cold start, and — the reason
 * that matters here — a failure is reported by emitting an `error` event on the model, not by
 * rejecting the query. So a unique index that cannot be built is silent.
 *
 * Several of this app's correctness guarantees are unique indexes, not application logic:
 *
 *   - `user_answers { attemptId, questionId }` is what makes answer autosave idempotent
 *     under a double-submit.
 *   - `flagged_questions { attemptId, questionId }` likewise for flagging.
 *   - `users.email` and `subjects.slug` are what turn a duplicate into a 409 instead of a
 *     second row.
 *   - `topics { subjectId, name }` blocks two identically-named topics in one subject.
 *
 * Run this once against a new database (`npm run db:indexes`) and a build failure is a build
 * failure rather than a duplicate that shows up months later.
 *
 * `syncIndexes()` is deliberate: it also DROPS indexes the schemas no longer declare, so this
 * converges an existing database rather than only adding to it. It does not touch `_id`.
 */
async function main() {
  await connectToDatabase();

  const names = Object.keys(mongoose.models).sort();
  console.log(`\nSyncing indexes for ${names.length} collections…\n`);

  let failed = 0;

  for (const name of names) {
    const model = mongoose.models[name];
    const collection = model.collection.collectionName;

    try {
      const dropped = await model.syncIndexes();
      const live = await model.collection.indexes();

      // `_id_` is implicit and always present; counting it would overstate the schema.
      const declared = live.filter((index) => index.name !== "_id_");
      const unique = declared.filter((index) => index.unique).length;

      console.log(
        `  ${collection.padEnd(22)} ${String(declared.length).padStart(2)} index(es)` +
          `${unique ? `, ${unique} unique` : ""}` +
          `${dropped.length ? ` — dropped ${dropped.join(", ")}` : ""}`
      );
    } catch (error) {
      failed += 1;
      // The overwhelmingly likely cause is pre-existing duplicate data, which a unique index
      // cannot be built over. Say so, because the driver's message alone rarely makes it
      // obvious that the fix is in the data and not in the schema.
      console.error(
        `  ${collection.padEnd(22)} FAILED — ${error instanceof Error ? error.message : error}`
      );
      console.error(
        `  ${" ".repeat(22)} if this is a duplicate-key error, the collection already holds ` +
          `rows the unique index forbids; remove them, then re-run.`
      );
    }
  }

  if (failed > 0) {
    throw new Error(`${failed} collection(s) could not be indexed — see above.`);
  }

  console.log("\nDone.\n");
}

main()
  .catch((error) => {
    console.error("\nIndex sync failed:\n", error);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
