import Link from "next/link";
import { db } from "@/lib/db";
import { evaluateChapters, fmtDate, type Status } from "@/lib/compliance";
import { formatEin } from "@/lib/irs/parse";
import { getSettings } from "@/lib/settings";
import { STATUS_DESCRIPTION, STATUS_META, StatusBadge } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { ExportMenu } from "@/components/export-menu";
import { ImportChaptersButton } from "@/components/import-chapters";
import { ChapterRow } from "@/components/chapter-row";

const ORDER: Status[] = ["red", "yellow", "green", "grey"];

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const region = one(sp.region);
  const district = one(sp.district);
  const statusFilter = one(sp.status) as Status | undefined;

  const settings = await getSettings();
  const [all, places, irsLoads] = await Promise.all([
    evaluateChapters({ region, district }, settings),
    db.chapter.findMany({ select: { region: true, district: true }, distinct: ["region", "district"], orderBy: [{ region: "asc" }, { district: "asc" }] }),
    db.irsDataLoad.findMany({ orderBy: { loadedAt: "desc" }, take: 3 }),
  ]);

  const counts = Object.fromEntries(ORDER.map((s) => [s, all.filter((c) => c.evaluation.status === s).length])) as Record<Status, number>;
  const submitted = all.filter((c) => c.evaluation.submitted).length;
  const rows = (statusFilter ? all.filter((c) => c.evaluation.status === statusFilter) : all).sort(
    (a, b) => ORDER.indexOf(a.evaluation.status) - ORDER.indexOf(b.evaluation.status) || a.name.localeCompare(b.name),
  );

  const filterQs = (status?: Status) => {
    const p = new URLSearchParams();
    if (region) p.set("region", region);
    if (district) p.set("district", district);
    if (status && status !== statusFilter) p.set("status", status);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const exportQs = new URLSearchParams(Object.entries({ region, district, status: statusFilter }).filter(([, v]) => v) as [string, string][]).toString();
  const irsAsOf = irsLoads[0]?.loadedAt;
  const scope = [region, district].filter(Boolean).join(" · ") || "All chapters";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700">{new Date().getFullYear()} annual review · {scope}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {submitted} of {all.length} chapters submitted
          </h1>
          <div className="mt-2 h-1.5 w-72 max-w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${all.length ? (submitted / all.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportChaptersButton />
          <ExportMenu query={exportQs} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ORDER.map((s) => (
          <Link
            key={s}
            href={filterQs(s)}
            className={`group rounded-xl border bg-white p-4 shadow-sm transition hover:border-slate-300 ${statusFilter === s ? `border-transparent ring-2 ${STATUS_META[s].ring}` : "border-slate-200"}`}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <span className={`size-2.5 rounded-full ${STATUS_META[s].dot}`} />
              {STATUS_META[s].label}
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{counts[s]}</div>
            <div className="mt-0.5 text-xs text-slate-500">{STATUS_DESCRIPTION[s]}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <FilterBar places={places} region={region} district={district} />
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {statusFilter && (
              <Link href={filterQs(statusFilter)} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-200">
                Showing {STATUS_META[statusFilter].label.toLowerCase()} only ✕
              </Link>
            )}
            <span>{irsAsOf ? `IRS data loaded ${fmtDate(irsAsOf)}` : "IRS data not loaded — run npm run irs:load"}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Chapter</th>
                <th className="px-4 py-2.5">Region / District</th>
                <th className="px-4 py-2.5">IRS legal name</th>
                <th className="px-4 py-2.5">Fiscal year</th>
                <th className="px-4 py-2.5">Latest filing</th>
                <th className="px-4 py-2.5">Docs</th>
                <th className="px-4 py-2.5">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => {
                const ev = c.evaluation;
                const docCount = [ev.docs.determination, ev.docs.financial].filter(Boolean).length;
                return (
                  <ChapterRow key={c.id} href={`/chapters/${c.id}`}>
                    <td className="px-4 py-3"><StatusBadge status={ev.status} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/chapters/${c.id}`} className="font-medium text-slate-900 hover:underline">{c.name}</Link>
                      <div className="font-mono text-xs text-slate-500">{formatEin(c.ein)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.region}<div className="text-xs text-slate-500">{c.district}</div></td>
                    <td className="max-w-[19rem] px-4 py-3">
                      <div className="truncate text-slate-700" title={ev.irs.legalName ?? undefined}>{ev.irs.legalName ?? <span className="text-slate-400">—</span>}</div>
                      <div className={`text-xs ${ev.irs.exemptStatusTone === "bad" ? "font-medium text-rose-600" : "text-slate-500"}`}>{ev.irs.exemptStatus}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{ev.irs.fiscalYearLabel === "January – December" ? "Jan – Dec" : ev.irs.fiscalYearLabel}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {ev.irs.latestFiling ? (
                        <>
                          {ev.irs.latestFiling.source}
                          <div className="text-xs text-slate-500">ends {fmtDate(ev.irs.latestFiling.periodEnd)}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">None found</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`tabular-nums ${docCount === 2 ? "text-slate-700" : "text-slate-400"}`}>{docCount}/2</span>
                      {ev.processing && <div className="text-xs text-sky-600">reading…</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {ev.flags.map((f, i) => (
                          <span key={i} title={f.detail} className={`rounded px-1.5 py-0.5 text-xs font-medium ${f.severity === "red" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
                            {f.short}
                          </span>
                        ))}
                      </div>
                    </td>
                  </ChapterRow>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    No chapters match. {all.length === 0 && "Import a chapter list to get started."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
