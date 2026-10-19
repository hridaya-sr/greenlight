/**
 * Load IRS exempt-organization bulk data into the database, keyed by EIN.
 *
 *   npm run irs:load -- --sample                 # bundled demo fixtures (data/irs-sample)
 *   npm run irs:load -- --download               # fetch full files from irs.gov (large!)
 *   npm run irs:load -- --download --states DE,MD  # BMF for selected states only
 *   npm run irs:load -- --dir ./my-irs-files     # local copies you already downloaded
 *
 * Options:
 *   --chapters-only   Keep only rows whose EIN is in the Chapter table (fast, small DB)
 *   --only bmf,revocation,epostcard   Load a subset of datasets
 *
 * Each dataset load replaces that table's contents.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import Papa from "papaparse";
import unzipper from "unzipper";
import { db } from "../src/lib/db";
import {
  parseBmfRecord,
  parseEpostcardLine,
  parseRevocationLine,
  type BmfRow,
} from "../src/lib/irs/parse";

const IRS_URLS = {
  bmfRegion: (n: number) => `https://www.irs.gov/pub/irs-soi/eo${n}.csv`,
  bmfState: (st: string) => `https://www.irs.gov/pub/irs-soi/eo_${st.toLowerCase()}.csv`,
  revocation: "https://apps.irs.gov/pub/epostcard/data-download-revocation.zip",
  epostcard: "https://apps.irs.gov/pub/epostcard/data-download-epostcard.zip",
};

const DOWNLOAD_DIR = path.resolve("data/irs-downloads");
const SAMPLE_DIR = path.resolve("data/irs-sample");
const BATCH = 1000;

type Dataset = "bmf" | "revocation" | "epostcard";

function parseArgs(argv: string[]) {
  const args = {
    sample: false,
    download: false,
    dir: null as string | null,
    states: null as string[] | null,
    chaptersOnly: false,
    only: ["bmf", "revocation", "epostcard"] as Dataset[],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sample") args.sample = true;
    else if (a === "--download") args.download = true;
    else if (a === "--dir") args.dir = argv[++i];
    else if (a === "--states") args.states = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--chapters-only") args.chaptersOnly = true;
    else if (a === "--only") args.only = argv[++i].split(",") as Dataset[];
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(process.argv[1], "utf8").split("*/")[0]);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.sample && !args.download && !args.dir) {
    throw new Error("Choose a source: --sample, --download, or --dir <path>. See --help.");
  }
  return args;
}

async function download(url: string, dest: string) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`  using cached ${path.relative(process.cwd(), dest)}`);
    return dest;
  }
  console.log(`  downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`GET ${url} → ${res.status}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  let seen = 0;
  let lastLog = 0;
  const tmp = `${dest}.part`;
  const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  body.on("data", (chunk: Buffer) => {
    seen += chunk.length;
    if (Date.now() - lastLog > 2000) {
      lastLog = Date.now();
      const pct = total ? ` (${((seen / total) * 100).toFixed(0)}%)` : "";
      process.stdout.write(`    ${(seen / 1e6).toFixed(1)} MB${pct}\r`);
    }
  });
  await pipeline(body, fs.createWriteStream(tmp));
  fs.renameSync(tmp, dest);
  console.log(`    ${(seen / 1e6).toFixed(1)} MB done`);
  return dest;
}

/** Open a .txt/.csv file, or the first entry of a .zip, as a text stream. */
function openText(file: string): Readable {
  const raw = fs.createReadStream(file);
  if (file.toLowerCase().endsWith(".zip")) return raw.pipe(unzipper.ParseOne());
  return raw;
}

async function* lines(file: string) {
  const rl = readline.createInterface({ input: openText(file), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

async function chapterEinFilter(enabled: boolean) {
  if (!enabled) return null;
  const rows = await db.chapter.findMany({ select: { ein: true } });
  console.log(`  --chapters-only: filtering to ${rows.length} chapter EINs`);
  return new Set(rows.map((r) => r.ein));
}

async function loadBmf(files: string[], filter: Set<string> | null) {
  console.log(`\nEO BMF: ${files.length} file(s)`);
  await db.irsBmf.deleteMany();
  let total = 0;
  for (const file of files) {
    let batch: BmfRow[] = [];
    const sourceFile = path.basename(file);
    const flush = async () => {
      if (!batch.length) return;
      // A few EINs appear in more than one regional file; last write wins.
      const seen = new Map(batch.map((r) => [r.ein, r]));
      const rows = [...seen.values()];
      const existing = await db.irsBmf.findMany({
        where: { ein: { in: rows.map((r) => r.ein) } },
        select: { ein: true },
      });
      if (existing.length) {
        await db.irsBmf.deleteMany({ where: { ein: { in: existing.map((e) => e.ein) } } });
      }
      await db.irsBmf.createMany({ data: rows.map((r) => ({ ...r, sourceFile })) });
      total += rows.length;
      batch = [];
      process.stdout.write(`  ${total.toLocaleString()} rows\r`);
    };

    // Papa's Node stream mode emits rows; we buffer and flush in batches.
    const stream = openText(file).pipe(Papa.parse(Papa.NODE_STREAM_INPUT, { header: true, skipEmptyLines: true }));
    for await (const rec of stream as AsyncIterable<Record<string, string>>) {
      const row = parseBmfRecord(rec);
      if (!row || (filter && !filter.has(row.ein))) continue;
      batch.push(row);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
  }
  await db.irsDataLoad.create({ data: { dataset: "bmf", source: files.join(", "), rowCount: total } });
  console.log(`  loaded ${total.toLocaleString()} BMF rows`);
}

async function loadPipeFile<T extends { ein: string }>(
  dataset: "revocation" | "epostcard",
  file: string,
  parse: (line: string) => T | null,
  insert: (rows: T[]) => Promise<unknown>,
  clear: () => Promise<unknown>,
  filter: Set<string> | null,
) {
  console.log(`\n${dataset}: ${path.relative(process.cwd(), file)}`);
  await clear();
  let batch: T[] = [];
  let total = 0;
  let skipped = 0;
  for await (const line of lines(file)) {
    const row = parse(line);
    if (!row) {
      if (line.trim()) skipped++;
      continue;
    }
    if (filter && !filter.has(row.ein)) continue;
    batch.push(row);
    if (batch.length >= BATCH) {
      await insert(batch);
      total += batch.length;
      batch = [];
      process.stdout.write(`  ${total.toLocaleString()} rows\r`);
    }
  }
  if (batch.length) {
    await insert(batch);
    total += batch.length;
  }
  await db.irsDataLoad.create({ data: { dataset, source: file, rowCount: total } });
  console.log(`  loaded ${total.toLocaleString()} rows${skipped ? ` (skipped ${skipped} malformed)` : ""}`);
}

function findLocal(dir: string) {
  const entries = fs.readdirSync(dir).map((f) => path.join(dir, f));
  const base = (f: string) => path.basename(f).toLowerCase();
  return {
    bmf: entries.filter((f) => /^eo.*\.(csv|zip)$/.test(base(f))).sort(),
    revocation: entries.find((f) => base(f).includes("revocation")) ?? null,
    epostcard: entries.find((f) => base(f).includes("epostcard")) ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let files: ReturnType<typeof findLocal>;

  if (args.download) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    console.log(`Downloading IRS files to ${path.relative(process.cwd(), DOWNLOAD_DIR)}/ (cached between runs)`);
    const bmf: string[] = [];
    if (args.only.includes("bmf")) {
      const urls = args.states
        ? args.states.map((s) => IRS_URLS.bmfState(s))
        : [1, 2, 3, 4].map((n) => IRS_URLS.bmfRegion(n));
      for (const url of urls) bmf.push(await download(url, path.join(DOWNLOAD_DIR, path.basename(url))));
    }
    files = {
      bmf,
      revocation: args.only.includes("revocation")
        ? await download(IRS_URLS.revocation, path.join(DOWNLOAD_DIR, "data-download-revocation.zip"))
        : null,
      epostcard: args.only.includes("epostcard")
        ? await download(IRS_URLS.epostcard, path.join(DOWNLOAD_DIR, "data-download-epostcard.zip"))
        : null,
    };
  } else {
    const dir = args.sample ? SAMPLE_DIR : path.resolve(args.dir!);
    if (!fs.existsSync(dir)) throw new Error(`Directory not found: ${dir}${args.sample ? " (run `npm run samples` first)" : ""}`);
    files = findLocal(dir);
    console.log(`Loading local IRS files from ${path.relative(process.cwd(), dir) || dir}/`);
  }

  const filter = await chapterEinFilter(args.chaptersOnly);

  if (args.only.includes("bmf")) {
    if (files.bmf.length) await loadBmf(files.bmf, filter);
    else console.warn("\n! No BMF files (eo*.csv) found — skipping");
  }
  if (args.only.includes("revocation")) {
    if (files.revocation) {
      await loadPipeFile(
        "revocation", files.revocation, parseRevocationLine,
        (rows) => db.irsRevocation.createMany({ data: rows }),
        () => db.irsRevocation.deleteMany(), filter,
      );
    } else console.warn("\n! No revocation file found — skipping");
  }
  if (args.only.includes("epostcard")) {
    if (files.epostcard) {
      await loadPipeFile(
        "epostcard", files.epostcard, parseEpostcardLine,
        (rows) => db.irs990N.createMany({ data: rows }),
        () => db.irs990N.deleteMany(), filter,
      );
    } else console.warn("\n! No 990-N file found — skipping");
  }
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
