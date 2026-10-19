import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { extractText } from "unpdf";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { TEXT_FALLBACK_LABEL, extractFromText } from "@/lib/text-extraction";

export const EXTRACTION_MODEL = "claude-opus-5-5";

export const ACCEPTED_TYPES = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/gif": "GIF",
} as const;
export type AcceptedType = keyof typeof ACCEPTED_TYPES;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const Sourced = z.object({
  value: z.string().describe("The normalized value"),
  page: z.number().int().describe("1-indexed page the value appears on (1 for images)"),
  source_text: z
    .string()
    .describe("The exact text from the document the value was read from, copied character for character"),
});

const ExtractionSchema = z.object({
  document_type: z.enum(["irs_determination_letter", "bank_statement", "budget", "other"]),
  ein: Sourced.nullable().describe("Employer Identification Number, normalized as NN-NNNNNNN"),
  organization_name: Sourced.nullable().describe("Organization or account holder name exactly as printed"),
  ending_balance: Sourced.nullable().describe(
    "Ending/closing balance as a plain decimal like 12345.67 (negative if overdrawn). For a budget, the projected ending balance if stated. Null for determination letters.",
  ),
  dates: z
    .array(
      Sourced.extend({
        label: z.string().describe('What the date is, e.g. "Letter date", "Effective date of exemption", "Statement period start", "Statement period end", "Budget year start"'),
      }),
    )
    .describe("Every meaningful document date, value normalized as YYYY-MM-DD"),
  notes: z.string().nullable().describe("Anything that prevented a confident read (illegible, cut off, wrong document type)"),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const SYSTEM = `You extract data from documents that local chapters of a national nonprofit submit to their headquarters for an annual compliance review. The documents are usually an IRS determination letter (proof of tax-exempt status) and either a bank statement or a budget.

Extract only what is printed in the document. Never infer or guess a value: if a field is not present, return null (or an empty list for dates).

For every value, record provenance:
- page: the 1-indexed page where it appears. For a single image, use 1.
- source_text: the shortest complete line or phrase containing the value, copied exactly as printed, including labels, punctuation, and capitalization (for example "Employer Identification Number: 12-3456789"). Do not paraphrase or fix typos. Headquarters reviewers compare this text against the document.

Normalize values: EIN as NN-NNNNNNN, dates as YYYY-MM-DD, money as a plain decimal with no currency symbol or commas.`;

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error("ANTHROPIC_API_KEY is not set, so documents can't be read automatically");
  }
  client ??= new Anthropic();
  return client;
}

export async function extractFromDocument(data: Buffer, mimeType: AcceptedType, kindHint: string): Promise<Extraction> {
  const b64 = data.toString("base64");
  const fileBlock: Anthropic.Beta.BetaContentBlockParam =
    mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data: b64 } };

  const expected =
    kindHint === "determination_letter"
      ? "The chapter uploaded this as their IRS determination letter."
      : "The chapter uploaded this as a bank statement or budget.";

  const response = await anthropic().beta.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    // Simple, well-specified extraction: low effort keeps uploads fast.
    output_config: { effort: "low", format: betaZodOutputFormat(ExtractionSchema) },
    // If the model declines for policy reasons, retry server-side on Anthropic's default fallback.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: `${expected} Extract the fields.` }],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The document couldn't be processed (the model declined to read it)");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error("The extraction response was incomplete");
  }
  return response.parsed_output;
}

const squash = (s: string) =>
  s
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Per-page text layer of a PDF, or null if it has none (e.g. a scan). */
async function pdfPages(data: Buffer): Promise<string[] | null> {
  try {
    const { text } = await extractText(new Uint8Array(data));
    return text.some((t) => t.trim().length > 20) ? text : null;
  } catch {
    return null;
  }
}

export function hasApiKey() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Check each quoted source against the text layer, correcting the page if it was found elsewhere. */
function verify(field: { page: number; source_text: string }, rawPages: string[] | null) {
  if (!rawPages) return { page: field.page, verified: null };
  const pages = rawPages.map(squash);
  const needle = squash(field.source_text);
  if (!needle) return { page: field.page, verified: false };
  if (pages[field.page - 1]?.includes(needle)) return { page: field.page, verified: true };
  const found = pages.findIndex((p) => p.includes(needle));
  return found >= 0 ? { page: found + 1, verified: true } : { page: field.page, verified: false };
}

/** Run extraction for a stored document and save fields. Never throws; failures are recorded on the document. */
export async function processDocument(documentId: string) {
  const doc = await db.document.update({
    where: { id: documentId },
    data: { extractionStatus: "processing", extractionError: null },
  });
  try {
    const data = await getStorage().get(doc.storageKey);
    const pages = doc.mimeType === "application/pdf" ? await pdfPages(data) : null;
    let result: Extraction;
    let extractedBy: string;
    if (hasApiKey()) {
      result = await extractFromDocument(data, doc.mimeType as AcceptedType, doc.kind);
      extractedBy = EXTRACTION_MODEL;
    } else {
      // No key: read the PDF's text layer with pattern matching instead of Claude.
      if (!pages) throw new Error("Scans and photos need ANTHROPIC_API_KEY to be read automatically");
      result = extractFromText(pages);
      extractedBy = TEXT_FALLBACK_LABEL;
    }

    const rows: { field: string; label: string; value: string; page: number; sourceText: string; verified: boolean | null }[] = [];
    const push = (field: string, label: string, f: z.infer<typeof Sourced> | null) => {
      if (!f) return;
      rows.push({ field, label, value: f.value, sourceText: f.source_text, ...verify(f, pages) });
    };
    push("ein", "EIN", result.ein);
    push("org_name", result.document_type === "bank_statement" ? "Account holder" : "Organization name", result.organization_name);
    for (const d of result.dates) push("date", d.label, d);
    push("ending_balance", "Ending balance", result.ending_balance);

    await db.$transaction([
      db.extractedField.deleteMany({ where: { documentId } }),
      db.extractedField.createMany({ data: rows.map((r, sortOrder) => ({ ...r, documentId, sortOrder })) }),
      db.document.update({
        where: { id: documentId },
        data: {
          extractionStatus: "done",
          detectedType: result.document_type,
          extractedBy,
          extractedAt: new Date(),
          extractionError: result.notes && rows.length === 0 ? result.notes : null,
        },
      }),
    ]);
  } catch (e) {
    const message =
      e instanceof Anthropic.APIError ? `Claude API error (${e.status ?? "network"}): ${e.message}` : e instanceof Error ? e.message : String(e);
    console.error(`[extraction] ${documentId}:`, message);
    await db.document.update({
      where: { id: documentId },
      data: { extractionStatus: "failed", extractionError: message },
    });
  }
}
