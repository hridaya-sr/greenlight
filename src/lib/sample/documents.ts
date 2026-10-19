// Generates sample PDFs (an IRS-style determination letter and a two-page bank
// statement) for demo chapters. Every PDF is stamped as a sample, not an IRS or
// bank record. The generator also returns the field values with the exact line
// each one appears on, so seeded documents carry real provenance that matches
// the PDF text.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatEin } from "@/lib/irs/parse";
import {
  SAMPLE_ORG_NAME,
  irsLegalName,
  type SampleChapter,
} from "./chapters";

export type SeedField = {
  field: "ein" | "org_name" | "date" | "ending_balance";
  label: string;
  value: string;
  page: number;
  sourceText: string;
};

export type SampleDoc = {
  bytes: Uint8Array;
  fileName: string;
  detectedType: "irs_determination_letter" | "bank_statement";
  fields: SeedField[];
};

const DISCLAIMER = "SAMPLE DOCUMENT – generated for the Greenlight demo. Not an IRS or bank record.";

const longDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

class Writer {
  y = 740;
  constructor(
    public page: PDFPage,
    public font: PDFFont,
    public bold: PDFFont,
  ) {
    page.drawText(DISCLAIMER, { x: 50, y: 770, size: 8, font, color: rgb(0.7, 0.1, 0.1) });
  }
  line(text: string, opts: { size?: number; bold?: boolean; gap?: number; x?: number } = {}) {
    const size = opts.size ?? 11;
    this.page.drawText(text, { x: opts.x ?? 50, y: this.y, size, font: opts.bold ? this.bold : this.font });
    this.y -= opts.gap ?? size + 6;
    return text;
  }
  space(n = 10) {
    this.y -= n;
  }
}

function chapterSeed(ch: SampleChapter) {
  // Deterministic per-chapter variation
  return [...ch.ein].reduce((a, d) => a + Number(d), 0);
}

export async function makeDeterminationLetter(ch: SampleChapter): Promise<SampleDoc> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf.addPage([612, 792]), font, bold);

  const s = chapterSeed(ch);
  const letterDate = new Date(Date.UTC(2009 + (s % 12), s % 12, 1 + (s % 27)));
  const effective = new Date(Date.UTC(letterDate.getUTCFullYear() - 1, (s + 4) % 12, 1));
  const ein = formatEin(ch.documentEin ?? ch.ein);
  const name = irsLegalName(ch);

  w.line("Department of the Treasury", { bold: true, size: 12 });
  w.line("Internal Revenue Service", { size: 11 });
  w.line("Tax Exempt and Government Entities", { size: 10 });
  w.line("P.O. Box 2508, Cincinnati, OH 45201", { size: 10 });
  w.space(14);
  const dateLine = w.line(`Date: ${longDate(letterDate)}`);
  w.space(6);
  w.line(name, { bold: true });
  w.line(`${ch.school} – Greek Life Office`);
  w.line(`${ch.city}, ${ch.state} ${ch.zip}`);
  w.space(14);
  const einLine = w.line(`Employer Identification Number: ${ein}`);
  w.line("Code Section: 501(c)(7)");
  w.line("Form 990 required: Yes");
  const effLine = w.line(`Effective date of exemption: ${longDate(effective)}`);
  w.line("Contact telephone number: 877-829-5500");
  w.space(14);
  w.line("Dear Applicant:");
  w.space(4);
  for (const t of [
    "We're pleased to tell you we determined you're exempt from federal income tax under",
    "Internal Revenue Code (IRC) Section 501(c)(7). Donors generally can't deduct contributions",
    "made to you. Please keep this letter for your permanent records.",
    "",
    "You're required to file an annual information return (Form 990, 990-EZ, or 990-N) each",
    "year. If you fail to file a required return for three consecutive years, your exemption",
    "will be automatically revoked.",
  ]) w.line(t, { size: 10, gap: 14 });
  w.space(20);
  w.line("Sincerely,", { size: 10 });
  w.line("Director, Exempt Organizations Rulings and Agreements (sample)", { size: 10 });
  w.space(30);
  w.line("Letter 947 (sample)", { size: 8 });

  return {
    bytes: await pdf.save(),
    fileName: `${ch.name.replace(/\s+/g, "-")}-determination-letter.pdf`,
    detectedType: "irs_determination_letter",
    fields: [
      { field: "ein", label: "EIN", value: ein, page: 1, sourceText: einLine },
      { field: "org_name", label: "Organization name", value: name, page: 1, sourceText: name },
      { field: "date", label: "Letter date", value: iso(letterDate), page: 1, sourceText: dateLine },
      { field: "date", label: "Effective date of exemption", value: iso(effective), page: 1, sourceText: effLine },
    ],
  };
}

export async function makeBankStatement(ch: SampleChapter, now = new Date()): Promise<SampleDoc> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Most recent full calendar month
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const holder = `${SAMPLE_ORG_NAME} – ${ch.name} Chapter`;
  const s = chapterSeed(ch);
  const ending = ch.endingBalance;
  const deposits = [450 + s * 7, 125 + s * 3, 980 + s * 11].map((n) => Math.round(n * 100) / 100);
  const withdrawals = [310.25 + s, 642.1 + s * 2, 89.99, 1200 + s * 4].map((n) => Math.round(n * 100) / 100);
  const beginning =
    Math.round((ending - deposits.reduce((a, b) => a + b, 0) + withdrawals.reduce((a, b) => a + b, 0)) * 100) / 100;

  // Page 1: summary
  const p1 = new Writer(pdf.addPage([612, 792]), font, bold);
  p1.line("Riverbend Community Bank (sample)", { bold: true, size: 14 });
  p1.line("Member FDIC  ·  riverbend.example  ·  1-800-555-0142", { size: 9 });
  p1.space(16);
  p1.line("Business Checking Statement", { bold: true, size: 12 });
  const periodLine = p1.line(`Statement period: ${longDate(start)} – ${longDate(end)}`);
  p1.line(`Account number: ****${ch.ein.slice(-4)}`);
  p1.space(10);
  const holderLine = p1.line(`Account holder: ${holder}`);
  p1.line(`c/o ${ch.treasurer}, Treasurer`);
  p1.line(`${ch.city}, ${ch.state} ${ch.zip}`);
  p1.space(18);
  p1.line("Account summary", { bold: true });
  p1.line(`Beginning balance on ${longDate(start)}: ${money(beginning)}`);
  p1.line(`Deposits and credits (${deposits.length}): ${money(deposits.reduce((a, b) => a + b, 0))}`);
  p1.line(`Withdrawals and debits (${withdrawals.length}): ${money(withdrawals.reduce((a, b) => a + b, 0))}`);
  p1.line("See page 2 for transaction detail and ending balance.", { size: 9 });

  // Page 2: transactions + ending balance
  const p2 = new Writer(pdf.addPage([612, 792]), font, bold);
  p2.line("Transaction detail", { bold: true, size: 12 });
  p2.space(4);
  const tx: [string, string, number][] = [
    ["03", "Member dues – fall semester", deposits[0]],
    ["06", "Venue deposit – formal", -withdrawals[0]],
    ["11", "Philanthropy event proceeds", deposits[1]],
    ["15", "National HQ – per-member fees", -withdrawals[1]],
    ["19", "Office supplies", -withdrawals[2]],
    ["22", "Member dues – late payments", deposits[2]],
    ["27", "Chapter house utilities", -withdrawals[3]],
  ];
  const mon = start.toLocaleDateString("en-US", { month: "2-digit", timeZone: "UTC" });
  for (const [day, desc, amt] of tx) {
    p2.line(`${mon}/${day}   ${desc}`, { size: 10, gap: 0 });
    p2.line(amt < 0 ? `-${money(-amt)}` : money(amt), { size: 10, x: 450, gap: 16 });
  }
  p2.space(14);
  const endLine = p2.line(`Ending balance on ${longDate(end)}: ${money(ending)}`, { bold: true });

  return {
    bytes: await pdf.save(),
    fileName: `${ch.name.replace(/\s+/g, "-")}-bank-statement.pdf`,
    detectedType: "bank_statement",
    fields: [
      { field: "org_name", label: "Account holder", value: holder, page: 1, sourceText: holderLine },
      { field: "date", label: "Statement period start", value: iso(start), page: 1, sourceText: periodLine },
      { field: "date", label: "Statement period end", value: iso(end), page: 1, sourceText: periodLine },
      { field: "ending_balance", label: "Ending balance", value: ending.toFixed(2), page: 2, sourceText: endLine },
    ],
  };
}
