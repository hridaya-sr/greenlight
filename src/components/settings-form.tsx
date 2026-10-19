"use client";

import { useActionState, useState } from "react";
import type { Settings } from "@/generated/prisma/client";
import { saveSettings } from "@/app/(hq)/settings/actions";
import { buttonClass } from "@/components/ui";

const input =
  "mt-1 block w-full rounded-lg border-0 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-emerald-600";

function fill(pattern: string, org: string, ch: { name: string; region: string; district: string }) {
  return pattern
    .replaceAll("{Org Name}", org)
    .replaceAll("{Chapter Name}", ch.name)
    .replaceAll("{Region}", ch.region)
    .replaceAll("{District}", ch.district);
}

export function SettingsForm({
  settings,
  sampleChapter,
}: {
  settings: Settings;
  sampleChapter: { name: string; region: string; district: string };
}) {
  const [state, action, pending] = useActionState(saveSettings, null);
  const [org, setOrg] = useState(settings.orgName);
  const [pattern, setPattern] = useState(settings.namePattern);

  return (
    <form action={action} className="space-y-6">
      <label className="block text-sm font-medium text-slate-800">
        Organization name
        <input name="orgName" value={org} onChange={(e) => setOrg(e.target.value)} className={input} />
      </label>

      <div>
        <label className="block text-sm font-medium text-slate-800">
          Required chapter legal name format
          <input name="namePattern" value={pattern} onChange={(e) => setPattern(e.target.value)} className={`${input} font-mono`} />
        </label>
        <p className="mt-1.5 text-xs text-slate-500">
          Tokens: <code>{"{Org Name}"}</code>, <code>{"{Chapter Name}"}</code>, <code>{"{Region}"}</code>, <code>{"{District}"}</code>. Names are compared to the IRS legal name ignoring case and punctuation, since the IRS stores names in uppercase without dashes.
        </p>
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">Example for {sampleChapter.name}: </span>
          <span className="font-medium text-slate-900">{fill(pattern, org, sampleChapter)}</span>
        </div>
      </div>

      <label className="block text-sm font-medium text-slate-800">
        Recent filing window (months)
        <input name="filingLookbackMonths" type="number" min={6} max={60} defaultValue={settings.filingLookbackMonths} className={`${input} w-32`} />
        <span className="mt-1.5 block text-xs font-normal text-slate-500">
          A chapter is flagged red if its most recent 990-N or 990/990-EZ covers a period that ended longer ago than this.
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800">
          HQ contact name
          <input name="hqContactName" defaultValue={settings.hqContactName} className={input} />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          HQ contact email
          <input name="hqContactEmail" type="email" defaultValue={settings.hqContactEmail} className={input} />
        </label>
      </div>

      <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
        <button className={buttonClass.primary} disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        {state && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-600"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
