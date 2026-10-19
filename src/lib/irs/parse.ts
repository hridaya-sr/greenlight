// Parsers for the IRS bulk exempt-organization files.
//
// Formats verified against the live files (Oct 2026):
//
// EO BMF (https://www.irs.gov/pub/irs-soi/eo1.csv … eo4.csv, eo_xx.csv by state)
//   Comma-separated with a header row:
//   EIN,NAME,ICO,STREET,CITY,STATE,ZIP,GROUP,SUBSECTION,AFFILIATION,CLASSIFICATION,
//   RULING,DEDUCTIBILITY,FOUNDATION,ACTIVITY,ORGANIZATION,STATUS,TAX_PERIOD,ASSET_CD,
//   INCOME_CD,FILING_REQ_CD,PF_FILING_REQ_CD,ACCT_PD,ASSET_AMT,INCOME_AMT,REVENUE_AMT,
//   NTEE_CD,SORT_NAME
//
// Automatic Revocation list (https://apps.irs.gov/pub/epostcard/data-download-revocation.zip)
//   Pipe-delimited, no header:
//   EIN|Legal Name|DBA|Address|City|State|ZIP|Country|Exemption Type|
//   Revocation Date (DD-MON-YYYY)|Revocation Posting Date|Exemption Reinstatement Date
//
// 990-N e-Postcard (https://apps.irs.gov/pub/epostcard/data-download-epostcard.zip)
//   Pipe-delimited, no header, file starts with blank lines:
//   EIN|Tax Year|Legal Name|Gross receipts <= $50k (T/F)|Terminated (T/F)|
//   Tax Period Begin (MM-DD-YYYY)|Tax Period End|Website|Principal Officer Name|
//   Officer Addr 1|Officer Addr 2|Officer City|Officer Province|Officer State|
//   Officer ZIP|Officer Country|Mail Addr 1|Mail Addr 2|Mail City|Mail Province|
//   Mail State|Mail ZIP|Mail Country|DBA 1|DBA 2|DBA 3

export const BMF_COLUMNS = [
  "EIN", "NAME", "ICO", "STREET", "CITY", "STATE", "ZIP", "GROUP", "SUBSECTION",
  "AFFILIATION", "CLASSIFICATION", "RULING", "DEDUCTIBILITY", "FOUNDATION",
  "ACTIVITY", "ORGANIZATION", "STATUS", "TAX_PERIOD", "ASSET_CD", "INCOME_CD",
  "FILING_REQ_CD", "PF_FILING_REQ_CD", "ACCT_PD", "ASSET_AMT", "INCOME_AMT",
  "REVENUE_AMT", "NTEE_CD", "SORT_NAME",
] as const;

export type BmfRow = {
  ein: string;
  name: string;
  ico: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  groupExemption: string | null;
  subsection: string | null;
  affiliation: string | null;
  classification: string | null;
  ruling: string | null;
  deductibility: string | null;
  foundation: string | null;
  organization: string | null;
  status: string | null;
  taxPeriod: string | null;
  filingReqCd: string | null;
  acctPd: string | null;
  assetAmt: number | null;
  incomeAmt: number | null;
  revenueAmt: number | null;
  nteeCd: string | null;
  sortName: string | null;
};

export type RevocationRow = {
  ein: string;
  legalName: string;
  dba: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  exemptionType: string | null;
  revocationDate: Date | null;
  postingDate: Date | null;
  reinstatementDate: Date | null;
};

export type EpostcardRow = {
  ein: string;
  taxYear: number;
  orgName: string;
  grossReceiptsUnder50k: boolean;
  terminated: boolean;
  periodBegin: Date | null;
  periodEnd: Date | null;
  website: string | null;
  principalOfficer: string | null;
  city: string | null;
  state: string | null;
};

const blank = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

const num = (s: string | undefined) => {
  const t = blank(s);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function normalizeEin(raw: string): string {
  return raw.replace(/\D/g, "").padStart(9, "0");
}

export function formatEin(ein: string): string {
  const d = normalizeEin(ein);
  return `${d.slice(0, 2)}-${d.slice(2)}`;
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** "15-NOV-2017" → Date (UTC) */
export function parseDdMonYyyy(s: string | undefined): Date | null {
  const t = blank(s);
  if (!t) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(t);
  if (!m) return null;
  const month = MONTHS[m[2].toUpperCase()];
  if (month === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
}

/** "04-01-2009" (MM-DD-YYYY) → Date (UTC) */
export function parseMmDdYyyy(s: string | undefined): Date | null {
  const t = blank(s);
  if (!t) return null;
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(t);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
}

/** Map one BMF CSV record (keyed by header) to a DB row. */
export function parseBmfRecord(r: Record<string, string>): BmfRow | null {
  const einRaw = blank(r.EIN);
  const name = blank(r.NAME);
  if (!einRaw || !name) return null;
  return {
    ein: normalizeEin(einRaw),
    name,
    ico: blank(r.ICO),
    street: blank(r.STREET),
    city: blank(r.CITY),
    state: blank(r.STATE),
    zip: blank(r.ZIP),
    groupExemption: blank(r.GROUP),
    subsection: blank(r.SUBSECTION),
    affiliation: blank(r.AFFILIATION),
    classification: blank(r.CLASSIFICATION),
    ruling: blank(r.RULING),
    deductibility: blank(r.DEDUCTIBILITY),
    foundation: blank(r.FOUNDATION),
    organization: blank(r.ORGANIZATION),
    status: blank(r.STATUS),
    taxPeriod: blank(r.TAX_PERIOD),
    filingReqCd: blank(r.FILING_REQ_CD),
    acctPd: blank(r.ACCT_PD),
    assetAmt: num(r.ASSET_AMT),
    incomeAmt: num(r.INCOME_AMT),
    revenueAmt: num(r.REVENUE_AMT),
    nteeCd: blank(r.NTEE_CD),
    sortName: blank(r.SORT_NAME),
  };
}

/** Parse one line of the revocation file. Returns null for blank/malformed lines. */
export function parseRevocationLine(line: string): RevocationRow | null {
  if (!line.trim()) return null;
  const f = line.split("|");
  if (f.length < 10 || !/^\d{9}$/.test(f[0].trim())) return null;
  return {
    ein: f[0].trim(),
    legalName: (f[1] ?? "").trim(),
    dba: blank(f[2]),
    city: blank(f[4]),
    state: blank(f[5]),
    zip: blank(f[6]),
    exemptionType: blank(f[8]),
    revocationDate: parseDdMonYyyy(f[9]),
    postingDate: parseDdMonYyyy(f[10]),
    reinstatementDate: parseDdMonYyyy(f[11]),
  };
}

/** Parse one line of the 990-N file. Returns null for blank/malformed lines. */
export function parseEpostcardLine(line: string): EpostcardRow | null {
  if (!line.trim()) return null;
  const f = line.split("|");
  if (f.length < 7 || !/^\d{9}$/.test(f[0].trim())) return null;
  const taxYear = Number(f[1]);
  if (!Number.isInteger(taxYear)) return null;
  return {
    ein: f[0].trim(),
    taxYear,
    orgName: (f[2] ?? "").trim(),
    grossReceiptsUnder50k: f[3]?.trim() === "T",
    terminated: f[4]?.trim() === "T",
    periodBegin: parseMmDdYyyy(f[5]),
    periodEnd: parseMmDdYyyy(f[6]),
    website: blank(f[7]),
    principalOfficer: blank(f[8]),
    // Prefer mailing address (fields 18/20), fall back to officer address.
    city: blank(f[18]) ?? blank(f[11]),
    state: blank(f[20]) ?? blank(f[13]),
  };
}

/** BMF STATUS codes (from the IRS EO BMF extract documentation). */
export const BMF_STATUS: Record<string, string> = {
  "01": "Unconditional exemption",
  "02": "Conditional exemption",
  "12": "Trust described in section 4947(a)(2)",
  "25": "Organization terminating private foundation status",
};

export function bmfTaxPeriodEnd(taxPeriod: string | null): Date | null {
  if (!taxPeriod || !/^\d{6}$/.test(taxPeriod)) return null;
  const y = Number(taxPeriod.slice(0, 4));
  const m = Number(taxPeriod.slice(4, 6));
  // Last day of that month
  return new Date(Date.UTC(y, m, 0));
}
