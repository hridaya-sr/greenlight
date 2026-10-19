// Email previews for the placeholder "Send reminder" / "Send education notice"
// actions. Nothing is sent; these only produce text for the preview modal.
import type { Chapter, Settings } from "@/generated/prisma/client";
import type { Evaluation, FlagCode } from "@/lib/compliance";
import { formatEin } from "@/lib/irs/parse";

export type EmailPreview = { to: string; from: string; subject: string; body: string };

export function uploadUrl(token: string) {
  const base = (process.env.APP_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base.startsWith("http") ? base : `https://${base}`}/c/${token}`;
}

function from(s: Settings) {
  return `${s.hqContactName} <${s.hqContactEmail}>`;
}

export function reminderEmail(ch: Chapter, ev: Evaluation, s: Settings): EmailPreview {
  const missing = [
    !ev.docs.determination && "• Your IRS determination letter",
    !ev.docs.financial && "• A recent bank statement or your current budget",
  ].filter(Boolean);
  const year = new Date().getFullYear();
  return {
    to: ch.treasurerEmail,
    from: from(s),
    subject: `Reminder: ${ch.name} Chapter annual compliance documents`,
    body: [
      `Hi ${ch.name} Chapter Treasurer,`,
      "",
      `This is a friendly reminder to submit your ${year} annual compliance documents to ${s.orgName} headquarters.`,
      "",
      missing.length ? "We're still waiting on:" : "We have your documents. Thank you! You can replace them any time using the link below.",
      ...missing,
      "",
      "Upload here (no login needed; this link is unique to your chapter):",
      uploadUrl(ch.token),
      "",
      "PDFs and photos are both fine. It takes about two minutes.",
      "",
      "Thank you,",
      s.hqContactName,
      s.orgName,
    ].join("\n"),
  };
}

const EDUCATION: Record<FlagCode, { heading: string; text: string[] } | undefined> = {
  REVOKED: {
    heading: "Your chapter's tax-exempt status has been revoked",
    text: [
      "The IRS automatically revokes exemption when an organization doesn't file an annual return (990-N, 990-EZ, or 990) for three consecutive years. While revoked, the chapter may owe income tax and should not describe itself as tax-exempt.",
      "To reinstate, the chapter must file a new exemption application (Form 1024 for 501(c)(7) social clubs) with the IRS, and bring its annual filings up to date. Reach out to HQ before filing; we can help.",
    ],
  },
  NO_RECENT_FILING: {
    heading: "We couldn't find a recent annual filing",
    text: [
      "Most chapters can file the 990-N (e-Postcard) online in a few minutes at irs.gov if gross receipts are normally $50,000 or less. It's due by the 15th day of the 5th month after your fiscal year ends (May 15 for calendar-year chapters).",
      "Missing three years in a row triggers automatic revocation, so please file any missed years as soon as possible and let us know when it's done.",
    ],
  },
  NOT_IN_IRS: {
    heading: "We couldn't find your EIN in IRS exempt-organization data",
    text: [
      "Please double-check the EIN we have on file. If it's correct, the chapter may never have received its own exemption, or may be covered under a group exemption. Reply to this email and we'll sort it out together.",
    ],
  },
  NAME_FORMAT: {
    heading: "Your chapter's legal name doesn't follow the national naming format",
    text: [
      "Consistent legal names help HQ, banks, and the IRS match records to the right chapter. To update the name the IRS has on file, an officer can send a signed name-change letter to the IRS, or check the name-change box on the next annual return where available.",
    ],
  },
  FISCAL_YEAR: {
    heading: "Your chapter's fiscal year isn't January–December",
    text: [
      "National policy asks every chapter to use a calendar fiscal year so that reporting lines up across the organization. A chapter can change its accounting period by filing Form 1128 with the IRS, or in many cases simply by filing a short-period return. Please talk to HQ before making the change.",
    ],
  },
  EIN_MISMATCH: {
    heading: "The EIN on your documents doesn't match our records",
    text: [
      "Please confirm which EIN is correct. If the document you uploaded belongs to a different organization or has a typo, upload the correct one using the link below.",
    ],
  },
  UNREADABLE_DOCUMENT: {
    heading: "We couldn't read one of your documents",
    text: ["Please upload a clearer copy (a PDF downloaded from your bank or a well-lit photo works best)."],
  },
};

export function educationEmail(ch: Chapter, ev: Evaluation, s: Settings): EmailPreview {
  const flags = ev.flags.filter((f, i, all) => all.findIndex((g) => g.code === f.code) === i);
  const sections = flags.flatMap((f) => {
    const e = EDUCATION[f.code];
    if (!e) return [];
    return [`■ ${e.heading}`, `What we found: ${f.detail}`, "", ...e.text.flatMap((t) => [t, ""])];
  });
  return {
    to: ch.treasurerEmail,
    from: from(s),
    subject: flags.length
      ? `Action needed: ${flags.length === 1 ? flags[0].title : `${flags.length} compliance items`} (${ch.name} Chapter)`
      : `${ch.name} Chapter: you're all set`,
    body: [
      `Hi ${ch.name} Chapter Treasurer,`,
      "",
      flags.length
        ? `As part of ${s.orgName}'s annual review, we checked public IRS records for EIN ${formatEin(ch.ein)} and the documents your chapter submitted. Here's what needs attention:`
        : `As part of ${s.orgName}'s annual review, we checked public IRS records and your submitted documents. Everything looks good, and no action is needed.`,
      "",
      ...sections,
      "Your chapter's upload link:",
      uploadUrl(ch.token),
      "",
      "Questions? Just reply to this email.",
      "",
      s.hqContactName,
      s.orgName,
    ].join("\n"),
  };
}
