"use client";

import { useState } from "react";
import type { EmailPreview } from "@/lib/emails";
import { Modal } from "@/components/modal";
import { buttonClass } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

export function EmailActions({
  reminder,
  education,
  flagCount,
}: {
  reminder: EmailPreview;
  education: EmailPreview;
  flagCount: number;
}) {
  const [open, setOpen] = useState<null | "reminder" | "education">(null);
  const [sent, setSent] = useState(false);
  const email = open === "reminder" ? reminder : education;
  const close = () => {
    setOpen(null);
    setSent(false);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button className={buttonClass.secondary} onClick={() => setOpen("reminder")}>Send reminder</button>
      <button className={buttonClass.primary} onClick={() => setOpen("education")}>
        Send education notice{flagCount > 0 && <span className="rounded-full bg-white/20 px-1.5 text-xs">{flagCount}</span>}
      </button>
      <Modal
        open={open !== null}
        onClose={close}
        wide
        title={open === "reminder" ? "Preview: reminder email" : "Preview: education notice"}
        footer={
          <>
            <CopyButton text={`Subject: ${email.subject}\n\n${email.body}`} label="Copy text" />
            <button className={buttonClass.secondary} onClick={close}>Close</button>
            <button className={buttonClass.primary} onClick={() => setSent(true)} disabled={sent}>
              {sent ? "Logged (demo, not sent)" : "Send"}
            </button>
          </>
        }
      >
        <div className="mb-3 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Demo mode: email sending isn&apos;t connected, so nothing will be delivered.
        </div>
        <dl className="grid grid-cols-[4rem_1fr] gap-y-1 border-b border-slate-100 pb-3 text-sm">
          <dt className="text-slate-500">From</dt><dd className="text-slate-800">{email.from}</dd>
          <dt className="text-slate-500">To</dt><dd className="text-slate-800">{email.to}</dd>
          <dt className="text-slate-500">Subject</dt><dd className="font-medium text-slate-900">{email.subject}</dd>
        </dl>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{email.body}</pre>
      </Modal>
    </div>
  );
}
