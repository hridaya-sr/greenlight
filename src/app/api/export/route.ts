import ExcelJS from "exceljs";
import { evaluateChapters, fmtDate, type Status } from "@/lib/compliance";
import { uploadUrl } from "@/lib/emails";
import { formatEin } from "@/lib/irs/parse";
import { getSettings } from "@/lib/settings";
import { STATUS_META } from "@/components/ui";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "Status", "Chapter", "EIN", "Region", "District", "Treasurer email", "Submitted",
  "IRS legal name", "Expected name", "Exempt status", "Fiscal year", "Latest filing",
  "Ending balance", "Flags", "Upload link",
] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const region = url.searchParams.get("region") || undefined;
  const district = url.searchParams.get("district") || undefined;
  const status = (url.searchParams.get("status") || undefined) as Status | undefined;

  const settings = await getSettings();
  const chapters = (await evaluateChapters({ region, district }, settings)).filter(
    (c) => !status || c.evaluation.status === status,
  );

  const rows = chapters.map((c) => {
    const ev = c.evaluation;
    const balance = ev.docs.financial?.fields.find((f) => f.field === "ending_balance")?.value;
    return [
      STATUS_META[ev.status].label,
      c.name,
      formatEin(c.ein),
      c.region,
      c.district,
      c.treasurerEmail,
      ev.submitted ? "Yes" : "No",
      ev.irs.legalName ?? "",
      ev.expectedName,
      ev.irs.exemptStatus,
      ev.irs.fiscalYearLabel,
      ev.irs.latestFiling ? `${ev.irs.latestFiling.source}, period ending ${fmtDate(ev.irs.latestFiling.periodEnd)}` : "None found",
      balance ? Number(balance) : "",
      ev.flags.map((f) => f.title).join("; "),
      uploadUrl(c.token),
    ];
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `greenlight-chapters-${stamp}.${format}`;

  if (format === "csv") {
    const cell = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [COLUMNS, ...rows].map((r) => r.map(cell).join(",")).join("\n");
    return new Response("﻿" + csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Chapters", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...COLUMNS]).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col, i) => (col.width = [10, 14, 12, 12, 12, 30, 10, 36, 36, 30, 22, 40, 14, 50, 50][i]));
  ws.getColumn(13).numFmt = '"$"#,##0.00';
  ws.autoFilter = { from: "A1", to: { row: 1, column: COLUMNS.length } };
  const fills: Record<string, string> = { Green: "FFD1FADF", Yellow: "FFFEF0C7", Red: "FFFEE4E2", "Not submitted": "FFF2F4F7" };
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const fill = fills[String(row.getCell(1).value)];
    if (fill) row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
