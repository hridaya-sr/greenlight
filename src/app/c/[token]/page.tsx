import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatEin } from "@/lib/irs/parse";
import { getSettings } from "@/lib/settings";
import { Logo } from "@/components/ui";
import { DocumentUploader } from "@/components/document-uploader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upload compliance documents", robots: { index: false, follow: false } };

export default async function ChapterUploadPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const chapter = await db.chapter.findUnique({
    where: { token },
    include: { documents: { orderBy: { uploadedAt: "desc" }, include: { fields: { orderBy: { sortOrder: "asc" } } } } },
  });
  if (!chapter) notFound();
  const settings = await getSettings();
  const latest = (kind: string) => chapter.documents.find((d) => d.kind === kind) ?? null;
  const serialize = (d: ReturnType<typeof latest>) =>
    d && {
      id: d.id,
      originalName: d.originalName,
      uploadedAt: d.uploadedAt.toISOString(),
      extractionStatus: d.extractionStatus,
      extractionError: d.extractionError,
      fields: d.fields.map((f) => ({ field: f.field, label: f.label, value: f.value })),
    };
  const done = !!latest("determination_letter") && !!latest("financial");

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 to-[#f7f8fa]">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <div className="mb-8 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">{settings.orgName}</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-400">powered by <Logo className="text-xs [&_svg]:size-4" /></span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{chapter.name} Chapter: annual compliance review</h1>
        <p className="mt-2 text-slate-600">
          National HQ reviews each chapter&apos;s tax-exempt status once a year. Please upload the two documents below. PDFs or clear phone photos both work.
        </p>
        <p className="mt-1 text-sm text-slate-500">EIN on file: <span className="font-mono">{formatEin(chapter.ein)}</span></p>

        {done && (
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 text-sm text-white shadow-sm">
            <svg viewBox="0 0 20 20" className="size-5 shrink-0" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
            You&apos;re all set. HQ has both documents. You can replace either one below if needed.
          </div>
        )}

        <div className="mt-8 space-y-4">
          <DocumentUploader
            token={token}
            kind="determination_letter"
            step={1}
            title="IRS determination letter"
            help="The letter from the IRS confirming your chapter is tax-exempt (often Letter 947 or 1045)."
            chapterEin={chapter.ein}
            initial={serialize(latest("determination_letter"))}
          />
          <DocumentUploader
            token={token}
            kind="financial"
            step={2}
            title="Bank statement or budget"
            help="Your most recent monthly bank statement, or this year's chapter budget."
            chapterEin={chapter.ein}
            initial={serialize(latest("financial"))}
          />
        </div>

        <p className="mt-10 text-center text-xs text-slate-400">
          This link is private to your chapter. Questions? Contact {settings.hqContactName} at{" "}
          <a className="underline" href={`mailto:${settings.hqContactEmail}`}>{settings.hqContactEmail}</a>.
        </p>
      </div>
    </div>
  );
}
