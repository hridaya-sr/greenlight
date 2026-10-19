/**
 * Generate demo inputs from src/lib/sample/chapters.ts:
 *
 *   data/irs-sample/eo_sample.csv                  EO BMF format (with header)
 *   data/irs-sample/data-download-revocation.txt   Revocation list format
 *   data/irs-sample/data-download-epostcard.txt    990-N format
 *   samples/chapters.csv, samples/chapters.xlsx    HQ chapter list upload
 *   samples/documents/*.pdf                        PDFs for the live upload demo
 *
 * Dates are relative to today so the demo stays current.
 *   npm run samples
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { BMF_COLUMNS, formatEin } from "../src/lib/irs/parse";
import {
  LIVE_DEMO_CHAPTERS,
  SAMPLE_CHAPTERS,
  irsLegalName,
  treasurerEmail,
  type SampleChapter,
} from "../src/lib/sample/chapters";
import { makeBankStatement, makeDeterminationLetter } from "../src/lib/sample/documents";

const IRS_DIR = path.resolve("data/irs-sample");
const SAMPLES_DIR = path.resolve("samples");
const DOCS_DIR = path.join(SAMPLES_DIR, "documents");

const now = new Date();
const lastTaxYear = now.getUTCFullYear() - 1;
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const pad = (n: number) => String(n).padStart(2, "0");
const ddMonYyyy = (y: number, m: number, d: number) => `${pad(d)}-${MON[m - 1]}-${y}`;
const mmDdYyyy = (y: number, m: number, d: number) => `${pad(m)}-${pad(d)}-${y}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function inBmf(ch: SampleChapter) {
  return ch.scenario !== "revoked" && ch.scenario !== "not_in_bmf";
}

function acctPd(ch: SampleChapter) {
  return ch.acctPd ?? "12";
}

// Nu files a 990-EZ (shows up as BMF TAX_PERIOD) instead of a 990-N.
const EZ_FILERS = new Set(["Nu"]);

function bmfRow(ch: SampleChapter, i: number): string[] {
  const fyEnd = Number(acctPd(ch));
  const taxPeriod = EZ_FILERS.has(ch.name) ? `${lastTaxYear}${pad(fyEnd)}` : "";
  const rec: Record<(typeof BMF_COLUMNS)[number], string> = {
    EIN: ch.ein,
    NAME: irsLegalName(ch),
    ICO: `% ${ch.treasurer.toUpperCase()}`,
    STREET: `${100 + i * 7} GREEK ROW`,
    CITY: ch.city.toUpperCase(),
    STATE: ch.state,
    ZIP: `${ch.zip}-0000`,
    GROUP: "0000",
    SUBSECTION: "07",
    AFFILIATION: "3",
    CLASSIFICATION: "1000",
    RULING: `${2008 + (i % 12)}${pad((i % 12) + 1)}`,
    DEDUCTIBILITY: "2",
    FOUNDATION: "00",
    ACTIVITY: "000000000",
    ORGANIZATION: "1",
    STATUS: "01",
    TAX_PERIOD: taxPeriod,
    ASSET_CD: taxPeriod ? "3" : "0",
    INCOME_CD: taxPeriod ? "3" : "0",
    FILING_REQ_CD: taxPeriod ? "01" : "02",
    PF_FILING_REQ_CD: "0",
    ACCT_PD: acctPd(ch),
    ASSET_AMT: taxPeriod ? String(Math.round(ch.endingBalance)) : "",
    INCOME_AMT: taxPeriod ? String(Math.round(ch.endingBalance * 2.1)) : "",
    REVENUE_AMT: taxPeriod ? String(Math.round(ch.endingBalance * 2.1)) : "",
    NTEE_CD: "N50",
    SORT_NAME: "",
  };
  return BMF_COLUMNS.map((c) => rec[c]);
}

/** 990-N filing periods (tax years) for a chapter. */
function epostcardYears(ch: SampleChapter): number[] {
  if (ch.scenario === "not_in_bmf" || EZ_FILERS.has(ch.name)) return [];
  if (ch.scenario === "no_filing") return [lastTaxYear - 6, lastTaxYear - 5, lastTaxYear - 4];
  if (ch.scenario === "revoked") return [lastTaxYear - 8, lastTaxYear - 7];
  const fyEnd = Number(acctPd(ch));
  // For non-calendar years, the most recent filed period ends in lastTaxYear,
  // so its tax year (the year it began) is lastTaxYear - 1.
  const latest = fyEnd === 12 ? lastTaxYear : lastTaxYear - 1;
  return [latest - 2, latest - 1, latest];
}

function epostcardLine(ch: SampleChapter, taxYear: number, i: number): string {
  const fyEnd = Number(acctPd(ch));
  const [by, bm] = fyEnd === 12 ? [taxYear, 1] : [taxYear, fyEnd + 1];
  const [ey, em] = fyEnd === 12 ? [taxYear, 12] : [taxYear + 1, fyEnd];
  const addr = `${100 + i * 7} Greek Row`;
  const f = [
    ch.ein, String(taxYear), irsLegalName(ch), "T", "F",
    mmDdYyyy(by, bm, 1), mmDdYyyy(ey, em, lastDay(ey, em)),
    "", ch.treasurer, addr, "", ch.city, "", ch.state, ch.zip, "US",
    addr, "", ch.city, "", ch.state, ch.zip, "US", "", "", "",
  ];
  return f.join("|");
}

function revocationLine(ch: SampleChapter, i: number): string | null {
  const addr = `${100 + i * 7} GREEK ROW`;
  const base = [ch.ein, irsLegalName(ch), "", addr, ch.city.toUpperCase(), ch.state, `${ch.zip}-0000`, "US", "07"];
  if (ch.scenario === "revoked") {
    const y = lastTaxYear;
    return [...base, ddMonYyyy(y, 5, 15), ddMonYyyy(y, 8, 11), ""].join("|");
  }
  if (ch.scenario === "reinstated") {
    const y = lastTaxYear - 4;
    return [...base, ddMonYyyy(y, 5, 15), ddMonYyyy(y, 8, 14), ddMonYyyy(y + 1, 10, 1)].join("|");
  }
  return null;
}

async function main() {
  fs.mkdirSync(IRS_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  // --- IRS fixtures -------------------------------------------------------
  const bmf = [BMF_COLUMNS.join(",")];
  const rev: string[] = [];
  const epc: string[] = ["", ""]; // real file starts with blank lines
  SAMPLE_CHAPTERS.forEach((ch, i) => {
    if (inBmf(ch)) bmf.push(bmfRow(ch, i).join(","));
    const r = revocationLine(ch, i);
    if (r) rev.push(r);
    for (const ty of epostcardYears(ch)) epc.push(epostcardLine(ch, ty, i));
  });
  fs.writeFileSync(path.join(IRS_DIR, "eo_sample.csv"), bmf.join("\n") + "\n");
  fs.writeFileSync(path.join(IRS_DIR, "data-download-revocation.txt"), rev.join("\n") + "\n");
  fs.writeFileSync(path.join(IRS_DIR, "data-download-epostcard.txt"), epc.join("\n") + "\n");
  console.log(`IRS fixtures → ${path.relative(process.cwd(), IRS_DIR)}/ (${bmf.length - 1} BMF, ${rev.length} revocation, ${epc.length - 2} 990-N rows)`);

  // --- Chapter list -------------------------------------------------------
  const header = ["name", "EIN", "region", "district", "treasurer email"];
  const rows = SAMPLE_CHAPTERS.map((ch) => [ch.name, formatEin(ch.ein), ch.region, ch.district, treasurerEmail(ch)]);
  const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  fs.writeFileSync(
    path.join(SAMPLES_DIR, "chapters.csv"),
    [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n",
  );
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Chapters");
  ws.addRow(header).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col) => (col.width = 22));
  await wb.xlsx.writeFile(path.join(SAMPLES_DIR, "chapters.xlsx"));
  console.log(`Chapter list → samples/chapters.csv, samples/chapters.xlsx (${rows.length} chapters)`);

  // --- PDFs for the live upload demo -------------------------------------
  for (const name of LIVE_DEMO_CHAPTERS) {
    const ch = SAMPLE_CHAPTERS.find((c) => c.name === name)!;
    for (const doc of [await makeDeterminationLetter(ch), await makeBankStatement(ch, now)]) {
      fs.writeFileSync(path.join(DOCS_DIR, doc.fileName), doc.bytes);
      console.log(`Sample PDF → samples/documents/${doc.fileName}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
