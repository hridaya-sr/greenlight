import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  chapterInclude,
  evaluate,
  fmtDate,
  loadIrsRecords,
  namesMatch,
  type DocWithFields,
} from "@/lib/compliance";
import { educationEmail, reminderEmail, uploadUrl } from "@/lib/emails";
import { formatEin } from "@/lib/irs/parse";
import { getSettings } from "@/lib/settings";
import { Card, DefinitionList, StatusBadge } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { EmailActions } from "@/components/email-actions";

const DOC_KINDS = [
  { kind: "determination", title: "IRS determination letter" },
  { kind: "financial", title: "Bank statement or budget" },
] as const;

const DETECTED: Record<string, string> = {
  irs_determination_letter: "IRS determination letter",
  bank_statement: "Bank statement",
  budget: "Budget",
  other: "Other document",
};

export default async function ChapterPage({ params }: PageProps<"/chapters/[id]">) {
  const { id } = await params;
  const chapter = await db.chapter.findUnique({ where: { id }, include: chapterInclude });
  if (!chapter) notFound();
  const settings = await getSettings();
  const irs = (await loadIrsRecords([chapter.ein])).get(chapter.ein)!;
  const ev = evaluate(chapter, irs, settings);
  const link = uploadUrl(chapter.token);

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-800">← All chapters</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{chapter.name} Chapter</h1>
            <StatusBadge status={ev.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono">{formatEin(chapter.ein)}</span> · {chapter.region} · {chapter.district} · Treasurer:{" "}
            <a href={`mailto:${chapter.treasurerEmail}`} className="text-slate-700 hover:underline">{chapter.treasurerEmail}</a>
          </p>
        </div>
        <EmailActions reminder={reminderEmail(chapter, ev, settings)} education={educationEmail(chapter, ev, settings)} flagCount={ev.flags.length} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
        <span className="text-slate-500">Chapter upload link</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">{link}</code>
        <CopyButton text={link} />
        <a href={`/c/${chapter.token}`} target="_blank" className="font-medium text-emerald-700 hover:underline">Open ↗</a>
      </div>

      <Card title={`Flags (${ev.flags.length})`}>
        {ev.flags.length === 0 ? (
          <p className="text-sm text-slate-600">
            {ev.submitted ? "No issues found. IRS records and submitted documents check out." : "No IRS issues found. Waiting on documents from the chapter."}
          </p>
        ) : (
          <ul className="space-y-3">
            {ev.flags.map((f, i) => (
              <li key={i} className={`rounded-lg border-l-4 px-4 py-3 ${f.severity === "red" ? "border-rose-500 bg-rose-50/60" : "border-amber-400 bg-amber-50/60"}`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${f.severity === "red" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>{f.category}</span>
                  {f.title}
                </div>
                <p className="mt-1 text-sm text-slate-700">{f.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="IRS records" className="lg:col-span-2">
          {!irs.bmf && !irs.revocations.length && !irs.filings.length ? (
            <p className="text-sm text-slate-600">No record of EIN {formatEin(chapter.ein)} in the loaded IRS data.</p>
          ) : (
            <div className="space-y-5">
              <DefinitionList
                items={[
                  ["Legal name", ev.irs.legalName ?? "—"],
                  [
                    "Required format",
                    <span key="n" className="flex items-start gap-1.5">
                      {ev.irs.legalName && (namesMatch(ev.irs.legalName, ev.expectedName) ? <span className="text-emerald-600">✓</span> : <span className="text-amber-600">✗</span>)}
                      <span className="font-normal text-slate-600">{ev.expectedName}</span>
                    </span>,
                  ],
                  ["Exempt status", <span key="s" className={ev.irs.exemptStatusTone === "bad" ? "text-rose-600" : ""}>{ev.irs.exemptStatus}</span>],
                  ["Fiscal year", `${ev.irs.fiscalYearLabel}${irs.bmf?.acctPd ? ` (ACCT_PD ${irs.bmf.acctPd})` : ""}`],
                  ["Latest filing", ev.irs.latestFiling?.label ?? "None found"],
                  ...(irs.bmf
                    ? ([
                        ["Ruling date", irs.bmf.ruling ? `${irs.bmf.ruling.slice(4)}/${irs.bmf.ruling.slice(0, 4)}` : "—"],
                        ["Address on file", [irs.bmf.street, irs.bmf.city, irs.bmf.state].filter(Boolean).join(", ") || "—"],
                      ] as [string, string][])
                    : []),
                  ...(ev.irs.pastRevocation
                    ? ([["Revocation history", `Revoked ${fmtDate(ev.irs.pastRevocation.revocationDate!)}, reinstated ${fmtDate(ev.irs.pastRevocation.reinstatementDate!)}`]] as [string, string][])
                    : []),
                ]}
              />
              {irs.filings.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">990-N filings</h3>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {irs.filings.slice(0, 5).map((f) => (
                        <tr key={f.id}>
                          <td className="py-1.5 pr-3 font-medium text-slate-700">TY {f.taxYear}</td>
                          <td className="py-1.5 text-slate-600">{f.periodBegin && fmtDate(f.periodBegin)} – {f.periodEnd && fmtDate(f.periodEnd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-400">Sources: IRS EO Business Master File, Automatic Revocation list, 990-N (e-Postcard) data.</p>
            </div>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-3">
          {DOC_KINDS.map(({ kind, title }) => (
            <DocumentCard key={kind} title={title} doc={ev.docs[kind]} chapterEin={chapter.ein} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DocumentCard({ title, doc, chapterEin }: { title: string; doc: DocWithFields | null; chapterEin: string }) {
  if (!doc) {
    return (
      <Card title={title}>
        <p className="text-sm text-slate-500">Not submitted yet.</p>
      </Card>
    );
  }
  return (
    <Card
      title={title}
      action={<a href={`/api/files/${doc.id}`} target="_blank" className="text-sm font-medium text-emerald-700 hover:underline">View file ↗</a>}
    >
      <p className="mb-4 text-xs text-slate-500">
        {doc.originalName} · uploaded {fmtDate(doc.uploadedAt)}
        {doc.detectedType && <> · read as <span className="font-medium text-slate-700">{DETECTED[doc.detectedType] ?? doc.detectedType}</span></>}
        {doc.extractedBy && <> · {doc.extractedBy === "seed" ? "pre-extracted demo data" : `extracted by ${doc.extractedBy}`}</>}
      </p>
      {doc.extractionStatus === "failed" && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Couldn&apos;t read this document: {doc.extractionError}</p>}
      {(doc.extractionStatus === "pending" || doc.extractionStatus === "processing") && <p className="text-sm text-sky-700">Reading document…</p>}
      {doc.extractionStatus === "done" && doc.fields.length === 0 && <p className="text-sm text-slate-500">No fields found{doc.extractionError ? `: ${doc.extractionError}` : "."}</p>}
      {doc.fields.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-40 pb-2 pr-4">Field</th>
              <th className="pb-2 pr-4">Value</th>
              <th className="pb-2">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {doc.fields.map((f) => {
              const einMismatch = f.field === "ein" && f.value.replace(/\D/g, "") !== chapterEin;
              return (
                <tr key={f.id}>
                  <td className="py-2.5 pr-4 text-slate-500">{f.label}</td>
                  <td className={`py-2.5 pr-4 font-medium ${einMismatch ? "text-amber-700" : "text-slate-900"}`}>
                    {formatValue(f.field, f.value)}
                    {einMismatch && <div className="text-xs font-normal">≠ {formatEin(chapterEin)} on file</div>}
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">p. {f.page ?? "?"}</span>
                      <span className="text-slate-600">
                        <q className="font-mono text-xs">{f.sourceText}</q>
                        {f.verified === true && <span className="ml-1.5 whitespace-nowrap text-xs text-emerald-600" title="This exact text was found on that page of the PDF">✓ found in document</span>}
                        {f.verified === false && <span className="ml-1.5 whitespace-nowrap text-xs text-amber-600" title="This text wasn't found verbatim in the PDF text layer; review the document">⚠ not found verbatim</span>}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function formatValue(field: string, value: string) {
  if (field === "ending_balance" && !Number.isNaN(Number(value))) {
    return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
  if (field === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return fmtDate(new Date(`${value}T00:00:00Z`));
  return value;
}
