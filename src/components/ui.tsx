import type { ReactNode } from "react";
import type { Status } from "@/lib/compliance";

export const STATUS_META: Record<Status, { label: string; dot: string; pill: string; ring: string }> = {
  green: { label: "Green", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", ring: "ring-emerald-500" },
  yellow: { label: "Yellow", dot: "bg-amber-400", pill: "bg-amber-50 text-amber-800 ring-amber-600/20", ring: "ring-amber-400" },
  red: { label: "Red", dot: "bg-rose-500", pill: "bg-rose-50 text-rose-700 ring-rose-600/20", ring: "ring-rose-500" },
  grey: { label: "Not submitted", dot: "bg-slate-300", pill: "bg-slate-100 text-slate-600 ring-slate-500/20", ring: "ring-slate-300" },
};

export const STATUS_DESCRIPTION: Record<Status, string> = {
  red: "Revoked, not found, or no recent IRS filing",
  yellow: "Name, fiscal year, or document issue",
  green: "Submitted, nothing flagged",
  grey: "Documents not yet submitted",
};

export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${m.pill}`}>
      <span className={`size-2 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-slate-900 ${className}`}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect width="24" height="24" rx="6" className="fill-emerald-600" />
        <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Greenlight
    </span>
  );
}

export const buttonClass = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
  ghost: "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100",
};

export function DefinitionList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="font-medium text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
