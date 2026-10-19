// Compliance rules: turns a chapter's IRS records and extracted document
// fields into flags and a green/yellow/red/grey status. Pure functions, so the
// dashboard, detail view, and export always agree, and changing settings
// (e.g. the naming pattern) takes effect immediately.
import type {
  Prisma,
  Chapter,
  Document,
  ExtractedField,
  Irs990N,
  IrsBmf,
  IrsRevocation,
  Settings,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { BMF_STATUS, bmfTaxPeriodEnd, formatEin, normalizeEin } from "@/lib/irs/parse";

export type Status = "green" | "yellow" | "red" | "grey";

export type FlagCode =
  | "REVOKED"
  | "NO_RECENT_FILING"
  | "NOT_IN_IRS"
  | "NAME_FORMAT"
  | "FISCAL_YEAR"
  | "EIN_MISMATCH"
  | "UNREADABLE_DOCUMENT";

export type Flag = {
  code: FlagCode;
  category: "Status" | "Name" | "Fiscal year" | "Document";
  severity: "red" | "yellow";
  short: string; // chip label for the dashboard
  title: string;
  detail: string;
};

export type DocWithFields = Document & { fields: ExtractedField[] };
export type ChapterWithDocs = Chapter & { documents: DocWithFields[] };

export type IrsRecords = {
  bmf: IrsBmf | null;
  revocations: IrsRevocation[];
  filings: Irs990N[];
};

export type LatestFiling = {
  source: "990-N" | "990/990-EZ (BMF)";
  periodEnd: Date;
  label: string;
};

export type IrsSummary = {
  legalName: string | null;
  exemptStatus: string;
  exemptStatusTone: "ok" | "bad" | "unknown";
  fiscalYearEndMonth: number | null;
  fiscalYearLabel: string;
  latestFiling: LatestFiling | null;
  activeRevocation: IrsRevocation | null;
  pastRevocation: IrsRevocation | null;
  subsection: string | null;
};

export type Evaluation = {
  status: Status;
  flags: Flag[];
  submitted: boolean;
  docs: { determination: DocWithFields | null; financial: DocWithFields | null };
  processing: boolean;
  irs: IrsSummary;
  expectedName: string;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(m: number) {
  return MONTH_NAMES[m - 1] ?? "?";
}

export function fiscalYearLabel(endMonth: number | null) {
  if (!endMonth) return "Unknown";
  if (endMonth === 12) return "January – December";
  return `${monthName((endMonth % 12) + 1)} – ${monthName(endMonth)}`;
}

/** Fill the HQ naming pattern for a chapter. */
export function expectedChapterName(pattern: string, orgName: string, chapter: Pick<Chapter, "name" | "region" | "district">) {
  return pattern
    .replaceAll("{Org Name}", orgName)
    .replaceAll("{Chapter Name}", chapter.name)
    .replaceAll("{Region}", chapter.region)
    .replaceAll("{District}", chapter.district);
}

/**
 * Compare names the way the IRS stores them: uppercase, no punctuation
 * (dashes, commas, periods are dropped), "&" spelled "AND".
 */
export function normalizeName(s: string) {
  return s
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function namesMatch(irsName: string, expected: string) {
  const a = normalizeName(irsName);
  const b = normalizeName(expected);
  if (a === b) return true;
  // The BMF truncates NAME to 70 characters.
  return irsName.length >= 70 && b.startsWith(a);
}

function latestFiling(irs: IrsRecords): LatestFiling | null {
  const candidates: LatestFiling[] = [];
  for (const f of irs.filings) {
    if (!f.periodEnd) continue;
    candidates.push({
      source: "990-N",
      periodEnd: f.periodEnd,
      label: `990-N for tax year ${f.taxYear} (period ending ${fmtDate(f.periodEnd)})${f.terminated ? " — marked terminated" : ""}`,
    });
  }
  const bmfEnd = bmfTaxPeriodEnd(irs.bmf?.taxPeriod ?? null);
  if (bmfEnd) {
    candidates.push({
      source: "990/990-EZ (BMF)",
      periodEnd: bmfEnd,
      label: `Return for tax period ending ${fmtDate(bmfEnd)} (BMF TAX_PERIOD ${irs.bmf!.taxPeriod})`,
    });
  }
  candidates.sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());
  return candidates[0] ?? null;
}

export function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function revocationState(revs: IrsRevocation[]) {
  const sorted = [...revs].sort(
    (a, b) => (b.revocationDate?.getTime() ?? 0) - (a.revocationDate?.getTime() ?? 0),
  );
  const latest = sorted[0] ?? null;
  if (!latest) return { active: null, past: null };
  const reinstated =
    latest.reinstatementDate &&
    (!latest.revocationDate || latest.reinstatementDate >= latest.revocationDate);
  return reinstated ? { active: null, past: latest } : { active: latest, past: null };
}

export function summarizeIrs(irs: IrsRecords): IrsSummary {
  const { active, past } = revocationState(irs.revocations);
  const acct = irs.bmf?.acctPd ? Number(irs.bmf.acctPd) : null;
  const filing = latestFiling(irs);
  // If the BMF has no accounting period, infer it from the latest 990-N.
  const fyEnd = acct && acct >= 1 && acct <= 12 ? acct : filing?.source === "990-N" ? filing.periodEnd.getUTCMonth() + 1 : null;

  let exemptStatus: string;
  let tone: IrsSummary["exemptStatusTone"];
  if (active) {
    exemptStatus = `Revoked ${active.revocationDate ? fmtDate(active.revocationDate) : ""}`.trim();
    tone = "bad";
  } else if (irs.bmf) {
    const code = irs.bmf.status ?? "";
    exemptStatus = `${BMF_STATUS[code] ?? `Status code ${code || "—"}`}${irs.bmf.subsection ? ` · 501(c)(${Number(irs.bmf.subsection)})` : ""}`;
    tone = code === "01" ? "ok" : "unknown";
  } else {
    exemptStatus = "Not found in IRS data";
    tone = "unknown";
  }

  return {
    legalName: irs.bmf?.name ?? active?.legalName ?? irs.filings[0]?.orgName ?? null,
    exemptStatus,
    exemptStatusTone: tone,
    fiscalYearEndMonth: fyEnd,
    fiscalYearLabel: fiscalYearLabel(fyEnd),
    latestFiling: filing,
    activeRevocation: active,
    pastRevocation: past,
    subsection: irs.bmf?.subsection ?? active?.exemptionType ?? null,
  };
}

function latestDoc(docs: DocWithFields[], kind: string) {
  return (
    docs
      .filter((d) => d.kind === kind)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0] ?? null
  );
}

export function evaluate(
  chapter: ChapterWithDocs,
  irs: IrsRecords,
  settings: Pick<Settings, "orgName" | "namePattern" | "filingLookbackMonths">,
  now = new Date(),
): Evaluation {
  const summary = summarizeIrs(irs);
  const flags: Flag[] = [];
  const expectedName = expectedChapterName(settings.namePattern, settings.orgName, chapter);

  // --- Status -------------------------------------------------------------
  if (summary.activeRevocation) {
    const r = summary.activeRevocation;
    flags.push({
      code: "REVOKED",
      short: "Revoked",
      category: "Status",
      severity: "red",
      title: "Tax-exempt status revoked",
      detail: `On the IRS Automatic Revocation list${r.revocationDate ? ` effective ${fmtDate(r.revocationDate)}` : ""}${r.postingDate ? ` (posted ${fmtDate(r.postingDate)})` : ""}, with no reinstatement.`,
    });
  }
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - settings.filingLookbackMonths);
  const hasAnyIrs = irs.bmf || irs.revocations.length || irs.filings.length;
  if (!hasAnyIrs) {
    flags.push({
      code: "NOT_IN_IRS",
      short: "Not in IRS data",
      category: "Status",
      severity: "red",
      title: "EIN not found in IRS data",
      detail: `${formatEin(chapter.ein)} isn't in the EO Business Master File, revocation list, or 990-N data. Check the EIN on file or whether the chapter ever obtained exemption.`,
    });
  } else if (!summary.activeRevocation && (!summary.latestFiling || summary.latestFiling.periodEnd < cutoff)) {
    flags.push({
      code: "NO_RECENT_FILING",
      short: "No recent filing",
      category: "Status",
      severity: "red",
      title: "No recent annual filing",
      detail: summary.latestFiling
        ? `Most recent filing found: ${summary.latestFiling.label}. Nothing for a period ending after ${fmtDate(cutoff)} (${settings.filingLookbackMonths}-month window). Three missed years means automatic revocation.`
        : "No 990-N or 990/990-EZ filing found in IRS data.",
    });
  }

  // --- Name ---------------------------------------------------------------
  if (summary.legalName && !namesMatch(summary.legalName, expectedName)) {
    flags.push({
      code: "NAME_FORMAT",
      short: "Name",
      category: "Name",
      severity: "yellow",
      title: "IRS legal name doesn't match naming format",
      detail: `IRS has "${summary.legalName}". HQ format expects "${expectedName}" (compared ignoring case and punctuation).`,
    });
  }

  // --- Fiscal year --------------------------------------------------------
  if (summary.fiscalYearEndMonth && summary.fiscalYearEndMonth !== 12) {
    flags.push({
      code: "FISCAL_YEAR",
      short: "Fiscal year",
      category: "Fiscal year",
      severity: "yellow",
      title: "Fiscal year isn't January – December",
      detail: `IRS accounting period ends in ${monthName(summary.fiscalYearEndMonth)} (${summary.fiscalYearLabel}).`,
    });
  }

  // --- Documents ----------------------------------------------------------
  const determination = latestDoc(chapter.documents, "determination_letter");
  const financial = latestDoc(chapter.documents, "financial");
  const current = [determination, financial].filter((d): d is DocWithFields => !!d);
  for (const doc of current) {
    if (doc.extractionStatus === "failed") {
      flags.push({
        code: "UNREADABLE_DOCUMENT",
      short: "Unreadable doc",
        category: "Document",
        severity: "yellow",
        title: "Document couldn't be read",
        detail: `${doc.originalName}: ${doc.extractionError ?? "extraction failed"}. Review it manually or ask the chapter to re-upload.`,
      });
    }
    for (const f of doc.fields.filter((f) => f.field === "ein")) {
      const docEin = normalizeEin(f.value);
      if (docEin.length === 9 && docEin !== chapter.ein) {
        flags.push({
          code: "EIN_MISMATCH",
      short: "EIN mismatch",
          category: "Document",
          severity: "yellow",
          title: "EIN on document doesn't match EIN on file",
          detail: `${doc.originalName} shows ${formatEin(docEin)} (page ${f.page ?? "?"}); HQ has ${formatEin(chapter.ein)}.`,
        });
      }
    }
  }

  const submitted = !!determination && !!financial;
  const processing = current.some((d) => d.extractionStatus === "pending" || d.extractionStatus === "processing");

  // Red is urgent whether or not the chapter has submitted; otherwise a
  // chapter is grey until both documents are in.
  let status: Status;
  if (flags.some((f) => f.severity === "red")) status = "red";
  else if (!submitted) status = "grey";
  else if (flags.length) status = "yellow";
  else status = "green";

  return { status, flags, submitted, docs: { determination, financial }, processing, irs: summary, expectedName };
}

/** Load IRS records for many EINs in three queries. */
export async function loadIrsRecords(eins: string[]): Promise<Map<string, IrsRecords>> {
  const [bmf, revs, filings] = await Promise.all([
    db.irsBmf.findMany({ where: { ein: { in: eins } } }),
    db.irsRevocation.findMany({ where: { ein: { in: eins } } }),
    db.irs990N.findMany({ where: { ein: { in: eins } }, orderBy: { taxYear: "desc" } }),
  ]);
  const map = new Map<string, IrsRecords>();
  for (const ein of eins) map.set(ein, { bmf: null, revocations: [], filings: [] });
  for (const b of bmf) map.get(b.ein)!.bmf = b;
  for (const r of revs) map.get(r.ein)!.revocations.push(r);
  for (const f of filings) map.get(f.ein)!.filings.push(f);
  return map;
}

export const chapterInclude = {
  documents: { include: { fields: { orderBy: { sortOrder: "asc" as const } } } },
};

export type EvaluatedChapter = ChapterWithDocs & { evaluation: Evaluation };

export async function evaluateChapters(
  where: Prisma.ChapterWhereInput,
  settings: Settings,
): Promise<EvaluatedChapter[]> {
  const chapters = await db.chapter.findMany({ where, include: chapterInclude, orderBy: { name: "asc" } });
  const irs = await loadIrsRecords(chapters.map((c) => c.ein));
  const now = new Date();
  return chapters.map((c) => ({ ...c, evaluation: evaluate(c, irs.get(c.ein)!, settings, now) }));
}
