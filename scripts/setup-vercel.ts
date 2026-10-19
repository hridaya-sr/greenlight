/**
 * Load the demo into the hosted Neon database and Vercel Blob store, from your
 * machine:
 *
 *   vercel env pull .env.vercel     # credentials of the linked Vercel project
 *   npm run setup:vercel
 *
 * Creates the tables, seeds settings, chapters, and sample documents, and
 * loads the sample IRS data. Your local .env and SQLite database are untouched,
 * and the local Prisma client is switched back to SQLite at the end.
 * Stop `npm run dev` first; it uses the same generated client.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import { parse } from "dotenv";

const ENV_FILE = process.argv[2] ?? ".env.vercel";

function run(cmd: string, env: NodeJS.ProcessEnv) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
}

function main() {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`${ENV_FILE} not found. Run: vercel env pull ${ENV_FILE}`);
  }
  const remote = parse(fs.readFileSync(ENV_FILE));
  if (remote.DATABASE_URL === "[SENSITIVE]") {
    throw new Error(
      "Vercel stores DATABASE_URL as a Sensitive variable, so it can't be pulled. You don't need this script: " +
        "the Vercel build creates the tables and loads the demo into an empty database (scripts/vercel-build.ts). " +
        "Or paste the connection string from the Neon dashboard into " + ENV_FILE + ".",
    );
  }
  // Schema changes should use a direct (unpooled) connection when available.
  const url = remote.DATABASE_URL_UNPOOLED || remote.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    throw new Error(`${ENV_FILE} has no Postgres DATABASE_URL. Connect the Neon store to your Vercel project, then pull again.`);
  }
  if (!remote.BLOB_STORE_ID && !remote.BLOB_READ_WRITE_TOKEN) {
    throw new Error(`${ENV_FILE} has no Blob credentials. Connect the Blob store to your Vercel project, then pull again.`);
  }

  // Remote values win over the local .env (dotenv/config never overrides).
  const env = { ...process.env, ...remote, DATABASE_URL: url, STORAGE_DRIVER: "blob" };
  const local = { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db" };
  try {
    run("npx prisma generate", env);
    run("npx prisma db push", env);
    run("npx tsx scripts/generate-samples.ts", env);
    run("npx tsx prisma/seed.ts", env);
    run("npx tsx scripts/load-irs.ts --sample", env);
  } finally {
    // Restore the SQLite client for local development.
    run("npx prisma generate", local);
  }
  console.log("\nHosted database and Blob store are ready. Deploy with: vercel --prod (or push to GitHub).");
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
