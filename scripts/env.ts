/**
 * Loads `.env` for the standalone scripts in this directory.
 *
 * WHY THIS EXISTS: `next dev` and `next build` load `.env` themselves, so nothing in `src/`
 * ever has to. The scripts here are plain `tsx` processes with no Next.js around them, and
 * `tsx` does not read `.env` — so without this, `MONGODB_URI` is undefined and every
 * `npm run db:*` command dies on the connection check in `src/lib/mongoose.ts`.
 *
 * Prisma used to cover this by accident: constructing a `PrismaClient` loaded `.env` as a
 * side effect, so the old seed script never needed a loader. Removing Prisma removed that.
 *
 * `@next/env` is used rather than `dotenv` because it applies the same file precedence the
 * app does (`.env.local` over `.env.development` over `.env`), so a script and a request
 * always resolve the same connection string.
 *
 * IMPORT THIS FIRST, before anything that reads `process.env`. ES module imports are
 * evaluated in source order, so `import "./env"` at the top of a script runs before the
 * modules below it — put it anywhere else and the variables land too late.
 */

import { loadEnvConfig } from "@next/env";

// `dev: false` keeps it quiet and skips `.env.development`; these scripts are not the dev
// server, and pointing a reset at the development database by default would be surprising.
loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
