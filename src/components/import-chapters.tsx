"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { buttonClass } from "@/components/ui";

type Result = { created: number; updated: number; errors: { row: number; message: string }[] };

export function ImportChaptersButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const close = () => {
    setOpen(false);
    setFile(null);
    setError(null);
    setResult(null);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/chapters/import", { method: "POST", body });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Import failed");
    setResult(json);
    router.refresh();
  };

  return (
    <>
      <button className={buttonClass.secondary} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor"><path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" /><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" /></svg>
        Import chapters
      </button>
      <Modal
        open={open}
        onClose={close}
        title="Import chapter list"
        footer={
          result ? (
            <button className={buttonClass.primary} onClick={close}>Done</button>
          ) : (
            <>
              <button className={buttonClass.secondary} onClick={close}>Cancel</button>
              <button className={buttonClass.primary} disabled={!file || busy} onClick={submit}>{busy ? "Importing…" : "Import"}</button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-700">
              <span className="font-semibold text-emerald-700">{result.created} added</span>, {result.updated} updated. Each new chapter gets its own private upload link.
            </p>
            {result.errors.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">{result.errors.length} row(s) skipped</p>
                <ul className="mt-1 list-disc pl-5">
                  {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e.row ? `Row ${e.row}: ` : ""}{e.message}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              Upload a CSV or Excel file with the columns <span className="font-medium text-slate-800">name, EIN, region, district, treasurer email</span>. Chapters are matched on EIN, so re-importing updates existing chapters and keeps their upload links and documents.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-center hover:border-emerald-500 hover:bg-emerald-50/40">
              <span className="font-medium text-slate-800">{file ? file.name : "Choose a .csv or .xlsx file"}</span>
              <span className="text-xs text-slate-500">{file ? `${(file.size / 1024).toFixed(1)} KB` : "Sample: samples/chapters.csv"}</span>
              <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {error && <p className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
