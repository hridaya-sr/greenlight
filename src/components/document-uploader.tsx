"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Doc = {
  id: string;
  originalName: string;
  uploadedAt: string;
  extractionStatus: string;
  extractionError: string | null;
  fields: { field: string; label: string; value: string }[];
};

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif";

export function DocumentUploader({
  token,
  kind,
  step,
  title,
  help,
  chapterEin,
  initial,
}: {
  token: string;
  kind: "determination_letter" | "financial";
  step: number;
  title: string;
  help: string;
  chapterEin: string;
  initial: Doc | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState<Doc | null>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const upload = async (file: File) => {
    setError(null);
    setBusy(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const res = await fetch(`/api/c/${token}/upload`, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Upload failed. Please try again.");
      setDoc({ ...json.document, uploadedAt: json.document.uploadedAt });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const ein = doc?.fields.find((f) => f.field === "ein")?.value;
  const einMismatch = ein && ein.replace(/\D/g, "") !== chapterEin;
  const summary = doc?.fields.filter((f) => ["ein", "org_name", "ending_balance"].includes(f.field)) ?? [];

  return (
    <section
      className={`rounded-xl border bg-white p-5 shadow-sm transition ${drag ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-slate-200"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !busy) upload(f);
      }}
    >
      <div className="flex items-start gap-4">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${doc ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
          {doc ? "✓" : step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{help}</p>

          {busy ? (
            <div className="mt-4 flex items-center gap-3 rounded-lg bg-sky-50 px-3 py-3 text-sm text-sky-800">
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" /><path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>
              Uploading and reading <span className="truncate font-medium">{busy}</span>. This can take up to a minute.
            </div>
          ) : doc ? (
            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate font-medium text-slate-800">{doc.originalName}</span>
                <button onClick={() => input.current?.click()} className="font-medium text-emerald-700 hover:underline">Replace</button>
              </div>
              <p className="text-xs text-slate-500">Received {new Date(doc.uploadedAt).toLocaleString()}</p>
              {doc.extractionStatus === "done" && summary.length > 0 && (
                <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {summary.map((f, i) => (
                    <div key={i} className="contents">
                      <dt className="text-slate-500">{f.label}</dt>
                      <dd className="text-slate-800">
                        {f.field === "ending_balance" && !Number.isNaN(Number(f.value))
                          ? Number(f.value).toLocaleString("en-US", { style: "currency", currency: "USD" })
                          : f.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {einMismatch && (
                <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                  The EIN on this document ({ein}) is different from the one HQ has on file. If this is the wrong document, please replace it. HQ will follow up otherwise.
                </p>
              )}
              {doc.extractionStatus === "failed" && (
                <p className="mt-2 text-xs text-slate-500">HQ received your file and will review it manually.</p>
              )}
            </div>
          ) : (
            <button
              onClick={() => input.current?.click()}
              className="mt-4 flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-sm hover:border-emerald-500 hover:bg-emerald-50/40"
            >
              <span className="font-medium text-emerald-700">Choose a file</span>
              <span className="text-xs text-slate-500">or drag it here · PDF, PNG, JPEG · up to 20 MB</span>
            </button>
          )}
          {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
        </div>
      </div>
    </section>
  );
}
