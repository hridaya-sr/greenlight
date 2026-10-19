import { randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { normalizeEin } from "@/lib/irs/parse";

/** 144 bits of randomness, URL-safe: the chapter's only credential. */
export function newChapterToken() {
  return randomBytes(18).toString("base64url");
}

export type ChapterInput = {
  name: string;
  ein: string;
  region: string;
  district: string;
  treasurerEmail: string;
};

export type ImportResult = {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
};

// Accept common header spellings: "Treasurer Email", "treasurer_email", "EIN", "ein", …
const HEADER_ALIASES: Record<keyof ChapterInput, string[]> = {
  name: ["name", "chapter", "chapter name", "chaptername"],
  ein: ["ein", "fein", "employer identification number", "tax id"],
  region: ["region"],
  district: ["district"],
  treasurerEmail: ["treasurer email", "treasureremail", "treasurer", "email", "treasurer e-mail"],
};

const COLUMN_LABELS: Record<keyof ChapterInput, string> = {
  name: "name",
  ein: "EIN",
  region: "region",
  district: "district",
  treasurerEmail: "treasurer email",
};

const norm = (h: string) => h.toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();

function mapHeaders(headers: string[]) {
  const map: Partial<Record<keyof ChapterInput, number>> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [keyof ChapterInput, string[]][]) {
      if (map[key] === undefined && aliases.includes(n)) map[key] = i;
    }
  });
  return map;
}

async function readRows(fileName: string, data: Buffer): Promise<string[][]> {
  if (/\.xlsx$/i.test(fileName)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as unknown[]; // 1-indexed
      rows.push(
        values.slice(1).map((v) => {
          if (v == null) return "";
          if (typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text);
          if (typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result);
          return String(v);
        }),
      );
    });
    return rows;
  }
  if (/\.(csv|txt)$/i.test(fileName)) {
    const parsed = Papa.parse<string[]>(data.toString("utf8").replace(/^﻿/, ""), { skipEmptyLines: true });
    return parsed.data;
  }
  throw new Error("Upload a .csv or .xlsx file");
}

export async function parseChapterFile(fileName: string, data: Buffer) {
  const rows = await readRows(fileName, data);
  if (rows.length < 2) throw new Error("The file needs a header row and at least one chapter");
  const map = mapHeaders(rows[0]);
  const missing = (Object.keys(HEADER_ALIASES) as (keyof ChapterInput)[]).filter((k) => map[k] === undefined);
  if (missing.length) {
    throw new Error(
      `Missing column(s): ${missing.map((k) => COLUMN_LABELS[k]).join(", ")}. Expected headers: name, EIN, region, district, treasurer email`,
    );
  }
  const chapters: ChapterInput[] = [];
  const errors: ImportResult["errors"] = [];
  rows.slice(1).forEach((r, i) => {
    const rowNum = i + 2;
    const get = (k: keyof ChapterInput) => (r[map[k]!] ?? "").trim();
    const einDigits = get("ein").replace(/\D/g, "");
    const email = get("treasurerEmail");
    if (!get("name")) return errors.push({ row: rowNum, message: "Missing chapter name" });
    if (einDigits.length !== 9) return errors.push({ row: rowNum, message: `EIN "${get("ein")}" must have 9 digits` });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errors.push({ row: rowNum, message: `Invalid email "${email}"` });
    chapters.push({
      name: get("name"),
      ein: normalizeEin(einDigits),
      region: get("region") || "Unassigned",
      district: get("district") || "Unassigned",
      treasurerEmail: email,
    });
  });
  const seen = new Set<string>();
  for (const c of chapters) {
    if (seen.has(c.ein)) errors.push({ row: 0, message: `EIN ${c.ein} appears more than once; last row wins` });
    seen.add(c.ein);
  }
  return { chapters, errors };
}

/** Upsert by EIN. Existing chapters keep their upload token and documents. */
export async function importChapters(fileName: string, data: Buffer): Promise<ImportResult> {
  const { chapters, errors } = await parseChapterFile(fileName, data);
  const existing = new Set(
    (await db.chapter.findMany({ where: { ein: { in: chapters.map((c) => c.ein) } }, select: { ein: true } })).map(
      (c) => c.ein,
    ),
  );
  let created = 0;
  let updated = 0;
  for (const c of chapters) {
    await db.chapter.upsert({
      where: { ein: c.ein },
      update: { name: c.name, region: c.region, district: c.district, treasurerEmail: c.treasurerEmail },
      create: { ...c, token: newChapterToken() },
    });
    if (existing.has(c.ein)) updated++;
    else {
      created++;
      existing.add(c.ein);
    }
  }
  return { created, updated, errors };
}
