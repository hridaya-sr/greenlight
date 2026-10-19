/**
 * Seed the demo: HQ settings plus 25 sample chapters. 14 chapters arrive with
 * documents already submitted and extracted (marked extractedBy = "seed"), so
 * the dashboard shows every status. Chapter tokens are random on each run.
 *
 * Does not touch IRS tables. Load those with `npm run irs:load -- --sample`.
 *   npm run db:seed
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db";
import { newChapterToken } from "../src/lib/chapter-import";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { getStorage, storageKey } from "../src/lib/storage";
import { SAMPLE_CHAPTERS, treasurerEmail } from "../src/lib/sample/chapters";
import { makeBankStatement, makeDeterminationLetter, type SampleDoc } from "../src/lib/sample/documents";

async function main() {
  await db.document.deleteMany();
  await db.chapter.deleteMany();
  if ((process.env.STORAGE_DRIVER ?? "local") === "local") {
    fs.rmSync(path.resolve(process.env.STORAGE_DIR ?? "./storage", "chapters"), { recursive: true, force: true });
  }

  await db.settings.upsert({
    where: { id: 1 },
    update: DEFAULT_SETTINGS,
    create: { id: 1, ...DEFAULT_SETTINGS },
  });

  const storage = getStorage();
  const now = new Date();
  let docs = 0;

  for (const [i, ch] of SAMPLE_CHAPTERS.entries()) {
    const chapter = await db.chapter.create({
      data: {
        name: ch.name,
        ein: ch.ein,
        region: ch.region,
        district: ch.district,
        treasurerEmail: treasurerEmail(ch),
        token: newChapterToken(),
      },
    });
    if (!ch.submitted) continue;

    const pairs: [string, SampleDoc][] = [
      ["determination_letter", await makeDeterminationLetter(ch)],
      ["financial", await makeBankStatement(ch, now)],
    ];
    for (const [kind, doc] of pairs) {
      const key = storageKey(chapter.id, doc.fileName);
      await storage.put(key, doc.bytes, "application/pdf");
      // Stagger upload times over the past few weeks
      const uploadedAt = new Date(now.getTime() - (i + 1) * 26 * 3600 * 1000);
      await db.document.create({
        data: {
          chapterId: chapter.id,
          kind,
          originalName: doc.fileName,
          mimeType: "application/pdf",
          sizeBytes: doc.bytes.length,
          storageKey: key,
          extractionStatus: "done",
          detectedType: doc.detectedType,
          extractedBy: "seed",
          extractedAt: uploadedAt,
          uploadedAt,
          fields: {
            create: doc.fields.map((f, sortOrder) => ({ ...f, verified: true, sortOrder })),
          },
        },
      });
      docs++;
    }
  }
  console.log(`Seeded settings, ${SAMPLE_CHAPTERS.length} chapters, ${docs} pre-extracted documents.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
