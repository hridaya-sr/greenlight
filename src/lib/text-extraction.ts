// Fallback extractor used when no Anthropic API key is configured.
//
// It reads the PDF's own text layer and finds fields with pattern matching:
// labeled lines like "Employer Identification Number: …", "Statement period: …",
// "Ending balance …". It handles the bundled sample PDFs and similar text-based
// documents, but not scans, photos, or unusual layouts. Claude handles those.
import type { Extraction } from "@/lib/extraction";

export const TEXT_FALLBACK_LABEL = "text-pattern fallback (no API key)";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATE_RE = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/gi;

function isoDates(s: string): string[] {
  return [...s.matchAll(DATE_RE)].map((m) => {
    const d = new Date(Date.UTC(Number(m[3]), MONTHS.indexOf(m[1].toLowerCase()), Number(m[2])));
    return d.toISOString().slice(0, 10);
  });
}

type Line = { text: string; page: number };

export function extractFromText(pages: string[]): Extraction {
  const lines: Line[] = pages.flatMap((t, i) =>
    t.split("\n").map((text) => ({ text: text.trim(), page: i + 1 })).filter((l) => l.text),
  );
  const all = lines.map((l) => l.text).join("\n").toLowerCase();
  const find = (re: RegExp) => lines.find((l) => re.test(l.text));
  const sourced = (line: Line, value: string) => ({ value, page: line.page, source_text: line.text });

  const document_type: Extraction["document_type"] =
    /exempt from federal income tax|determination/.test(all) && /internal revenue service/.test(all)
      ? "irs_determination_letter"
      : /statement period|ending balance|account holder/.test(all)
        ? "bank_statement"
        : /budget/.test(all)
          ? "budget"
          : "other";

  // EIN: prefer a labeled line, else any NN-NNNNNNN
  const einLine = find(/(employer identification number|\bEIN\b)[^0-9]*\d{2}-?\d{7}/i) ?? find(/\b\d{2}-\d{7}\b/);
  const einMatch = einLine?.text.match(/\b(\d{2})-?(\d{7})\b/);
  const ein = einLine && einMatch ? sourced(einLine, `${einMatch[1]}-${einMatch[2]}`) : null;

  // Organization name: "Account holder: …", else the first all-caps name line on a letter
  let organization_name: Extraction["organization_name"] = null;
  const holder = find(/^(account holder|organization name|name)\s*:/i);
  if (holder) {
    organization_name = sourced(holder, holder.text.replace(/^[^:]+:\s*/, ""));
  } else {
    const caps = lines.find(
      (l) =>
        l.page === 1 &&
        /^[A-Z0-9&' .,-]+$/.test(l.text) &&
        l.text.split(/\s+/).length >= 3 &&
        !/^(DEPARTMENT|INTERNAL|SAMPLE|TAX EXEMPT)/.test(l.text),
    );
    if (caps) organization_name = sourced(caps, caps.text);
  }

  const dates: Extraction["dates"] = [];
  const labeledDate = (re: RegExp, labels: string[]) => {
    const line = find(re);
    if (!line) return;
    isoDates(line.text).slice(0, labels.length).forEach((value, i) => dates.push({ label: labels[i], ...sourced(line, value) }));
  };
  labeledDate(/^date\s*:/i, ["Letter date"]);
  labeledDate(/effective date of exemption/i, ["Effective date of exemption"]);
  labeledDate(/statement period/i, ["Statement period start", "Statement period end"]);
  labeledDate(/(fiscal|budget) year/i, ["Budget year start", "Budget year end"]);

  let ending_balance: Extraction["ending_balance"] = null;
  const balLine = [...lines].reverse().find((l) => /(ending|closing) balance/i.test(l.text) && /\$?-?[\d,]+\.\d{2}/.test(l.text));
  if (balLine) {
    const m = balLine.text.match(/(-)?\$?\s?(-)?([\d,]+\.\d{2})(?!.*\d)/);
    if (m) ending_balance = sourced(balLine, `${m[1] || m[2] ? "-" : ""}${m[3].replace(/,/g, "")}`);
  }

  const found = [ein, organization_name, ending_balance].filter(Boolean).length + dates.length;
  return {
    document_type,
    ein,
    organization_name,
    ending_balance,
    dates,
    notes: found ? null : "No recognizable fields in the text layer. Set ANTHROPIC_API_KEY to read this document with Claude.",
  };
}
