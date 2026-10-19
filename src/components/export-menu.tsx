"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";

export function ExportMenu({ query }: { query: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const href = (format: string) => `/api/export?${new URLSearchParams([...new URLSearchParams(query), ["format", format]])}`;
  return (
    <div ref={ref} className="relative">
      <button className={buttonClass.secondary} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.69L6.53 8.72a.75.75 0 00-1.06 1.06l4 4a.75.75 0 001.06 0l4-4a.75.75 0 10-1.06-1.06l-2.72 2.72V2.75z" /><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" /></svg>
        Export
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200">
          <a href={href("xlsx")} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>Excel (.xlsx)</a>
          <a href={href("csv")} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>CSV (.csv)</a>
        </div>
      )}
    </div>
  );
}
