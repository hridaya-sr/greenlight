/**
 * Runs before `next build` (see package.json "build"). On Postgres only:
 *
 *   1. `prisma db push` keeps the database schema in sync. Without
 *      --accept-data-loss it refuses changes that would drop data, so the
 *      build fails loudly instead.
 *   2. If the database has no chapters, loads the demo: settings, 25 sample
 *      chapters with their PDFs (into Blob), and the sample IRS data. A
 *      database that already has chapters is never modified.
 *
 * This runs inside Vercel's build because Neon credentials are stored as
 * Sensitive variables, which `vercel env pull` can't download.
 * Local SQLite builds skip everything.
 */
import { execSync } from "node:child_process";

const isPostgres = (u?: string) => !!u && /^postgres(ql)?:\/\//.test(u);

function run(cmd: string, env: NodeJS.ProcessEnv = process.env) {
  console.log(`\n[greenlight] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env });
}

async function main() {
  if (!isPostgres(process.env.DATABASE_URL)) {
    console.log("[greenlight] DATABASE_URL is not Postgres; skipping database setup.");
    return;
  }

  // Schema changes are safest over a direct (unpooled) connection.
  const unpooled = process.env.DATABASE_URL_UNPOOLED;
  run("npx prisma db push", { ...process.env, DATABASE_URL: isPostgres(unpooled) ? unpooled : process.env.DATABASE_URL });

  const { db } = await import("../src/lib/db");
  const chapters = await db.chapter.count();
  if (chapters > 0) {
    console.log(`[greenlight] Database has ${chapters} chapters; leaving data as is.`);
    await db.$disconnect();
    return;
  }

  // Check storage works before seeding, so a failure doesn't leave half a demo.
  const { getStorage, storageDriver } = await import("../src/lib/storage");
  const probe = `healthcheck/${Date.now()}.txt`;
  try {
    await getStorage().put(probe, new TextEncoder().encode("ok"), "text/plain");
    await getStorage().delete(probe);
  } catch (e) {
    console.warn(
      `[greenlight] WARNING: storage (${storageDriver()}) isn't writable during the build, so demo data was not loaded.`,
      e instanceof Error ? e.message : e,
    );
    await db.$disconnect();
    return;
  }
  await db.$disconnect();

  console.log("[greenlight] Empty database: loading demo data.");
  run("npx tsx scripts/generate-samples.ts");
  run("npx tsx prisma/seed.ts");
  run("npx tsx scripts/load-irs.ts --sample");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
