import "./env";

import { connectToDatabase, mongoose } from "@/lib/mongoose";

/**
 * Drops every collection, then reseeds. This is `npm run db:reset`.
 *
 * Replaces `prisma migrate reset --force`, which the README's "get back to a clean demo
 * state" instructions relied on. There is no migration history in MongoDB to replay, so all
 * that is left of that command is the drop and the reseed.
 *
 * COLLECTIONS ARE DROPPED, NOT THE DATABASE. `dropDatabase()` would also discard
 * database-scoped users and roles, which on Atlas is how access is granted — a developer who
 * ran this against a shared cluster would lock the application out of its own database and
 * have to re-grant by hand. Dropping the collections leaves the container and its grants
 * intact and is otherwise identical: indexes live on collections, so they go too, and the
 * next seed rebuilds them.
 *
 * THE HOST CHECK IS THE POINT. This is the one destructive command in the project, it is
 * spelled almost the same as `db:seed`, and it takes its target from whatever `MONGODB_URI`
 * happens to be — which on a machine configured for a deploy is production. So a non-local
 * URI is refused unless `--force` is passed explicitly.
 */

/** Hosts that cannot be anyone else's data. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/**
 * True only when every host in the URI is loopback.
 *
 * `mongodb+srv://` is never local: it resolves through DNS SRV records, which is an Atlas or
 * self-hosted-cluster arrangement. Parsing is done by hand rather than with `new URL()`
 * because a connection string may carry several comma-separated hosts, which `URL` rejects.
 */
function isLocalUri(uri: string): boolean {
  if (uri.startsWith("mongodb+srv://")) return false;

  const afterScheme = uri.slice(uri.indexOf("://") + 3);

  // Strip credentials — a password may itself contain '/' or '?', so the authority has to be
  // isolated before anything else is cut off it.
  const atIndex = afterScheme.lastIndexOf("@");
  const withoutCredentials = atIndex === -1 ? afterScheme : afterScheme.slice(atIndex + 1);

  const authority = withoutCredentials.split(/[/?]/)[0];
  if (!authority) return false;

  return authority.split(",").every((hostPort) => {
    // Take the host off `host:port`, keeping bracketed IPv6 literals whole.
    const host = hostPort.startsWith("[")
      ? hostPort.slice(0, hostPort.indexOf("]") + 1)
      : hostPort.split(":")[0];
    return LOCAL_HOSTS.has(host.toLowerCase());
  });
}

/** Hides the password so a printed connection string is safe in a terminal or CI log. */
function redact(uri: string): string {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:/@]+:)[^@]+@/, "$1****@");
}

async function main() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in.");
  }

  const forced = process.argv.includes("--force");

  if (!isLocalUri(uri) && !forced) {
    console.error(
      `\nRefusing to reset a non-local database.\n\n` +
        `  MONGODB_URI = ${redact(uri)}\n\n` +
        `This drops every collection. If that is genuinely what you want here, re-run it as:\n\n` +
        `  npm run db:reset -- --force\n`
    );
    process.exit(1);
  }

  await connectToDatabase();

  // Typed as optional because a Connection exists before it is connected; `connectToDatabase`
  // has already awaited the handshake, so this is a type narrowing rather than a real case.
  const db = mongoose.connection.db;
  if (!db) throw new Error("Connected, but no database handle — check the path on MONGODB_URI.");

  // Read the inventory before destroying it, so the output says what was actually lost.
  const collections = await db.listCollections().toArray();
  const names = collections.map((collection) => collection.name).sort();

  console.log(`\nResetting ${db.databaseName} at ${redact(uri)}`);
  if (forced && !isLocalUri(uri)) console.log("  (--force: this is NOT a local database)");

  if (names.length === 0) {
    console.log("\n  already empty — nothing to drop\n");
    return;
  }

  for (const name of names) {
    const count = await db.collection(name).countDocuments();
    await db.dropCollection(name);
    console.log(`  dropped ${name.padEnd(22)} ${count} document(s)`);
  }

  console.log(`\n${names.length} collection(s) dropped.`);
}

main()
  .then(async () => {
    // Imported lazily so the seed module is only evaluated once the drop has succeeded —
    // a top-level import would run it even on the paths above that bail out.
    const { seed } = await import("./seed");
    await seed();
  })
  .catch((error) => {
    console.error("\nReset failed:\n", error);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
