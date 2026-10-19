# Greenlight

A compliance dashboard for national headquarters of organizations with local
chapters. HQ uploads its chapter list. Greenlight checks each chapter's EIN
against IRS bulk data, collects each chapter's determination letter and bank
statement through a private upload link, reads those documents with Claude,
and shows every chapter as green, yellow, red, or grey.

This is an MVP for customer demos. It has no logins, and emails are previews only.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env        # ANTHROPIC_API_KEY is optional (see "Document extraction")
npm run setup               # create DB, generate sample files, seed, load sample IRS data
npm run dev                 # http://localhost:3000
```

`npm run setup` runs these steps, which you can also run on their own:

| Command | What it does |
|---|---|
| `npm run db:push` | Create/update the SQLite database (`dev.db`) from `prisma/schema.prisma` |
| `npm run samples` | Generate the sample IRS files, chapter CSV/XLSX, and demo PDFs from `src/lib/sample/chapters.ts` |
| `npm run db:seed` | Reset chapters and documents, then seed settings and 25 sample chapters (14 with documents already read in) |
| `npm run irs:load -- --sample` | Load the sample IRS files into the IRS tables |

Re-running `npm run db:seed` generates new chapter upload links.

## Loading IRS data

The IRS has no API for exempt-organization data. It publishes bulk files instead.
`scripts/load-irs.ts` loads three of them into tables keyed by EIN:

| Dataset | Source | Used for |
|---|---|---|
| EO Business Master File | `irs.gov/pub/irs-soi/eo1.csv` … `eo4.csv` (or `eo_xx.csv` per state) | Legal name, exempt status, accounting period (`ACCT_PD`), latest return (`TAX_PERIOD`) |
| Automatic Revocation list | `apps.irs.gov/pub/epostcard/data-download-revocation.zip` | Revocation and reinstatement dates |
| 990-N (e-Postcard) | `apps.irs.gov/pub/epostcard/data-download-epostcard.zip` | Most recent small-org filing |

The field layouts are documented at the top of `src/lib/irs/parse.ts`. I checked
them against the live files in October 2026.

```bash
npm run irs:load -- --sample                      # bundled demo files (same formats as the IRS's)
npm run irs:load -- --download                    # all four regional BMF files plus both zips (several hundred MB)
npm run irs:load -- --download --states VT,NH     # BMF for selected states only
npm run irs:load -- --dir ~/Downloads/irs         # local copies you already downloaded (.csv, .txt, or .zip)
npm run irs:load -- --download --chapters-only    # keep only rows for EINs in your chapter list
```

Downloads are cached in `data/irs-downloads/`. Each run replaces the contents of
the tables it loads, so loading real data removes the sample rows. The sample
chapters use EINs starting with `89-`, which the IRS doesn't assign, so with real
data loaded they will show "EIN not found". To get the demo back, run
`npm run irs:load -- --sample`.

`--chapters-only` keeps the database small, but if you then import new chapters
you need to load the IRS data again.

## Running the demo

1. **Dashboard** (`/`). The header shows "X of Y chapters submitted" and counts by color.
   Click a count to filter by status. Use the Region and District filters, and
   **Export** to download the current view as XLSX or CSV.
2. **Chapter detail.** Click any row to see:
   - the chapter's IRS data and how it compares with HQ's required name format
   - the flags
   - the fields read from each document, each with its page number and the exact text it came from. "✓ found in document" means that text was found verbatim in the PDF.
3. **Emails.** **Send reminder** and **Send education notice** on the detail page
   open a preview of the email to the treasurer. The education notice explains
   each flag. Nothing is sent.
4. **Chapter upload.** Copy a chapter's upload link from its detail page (try
   **Kappa** or **Sigma**, which haven't submitted) and open it. Upload the
   matching PDFs from `samples/documents/`. Each file is read while you wait
   (by Claude if a key is set, otherwise by the text fallback). The Sigma determination letter has a mistyped EIN on purpose, so Sigma
   turns yellow with an EIN-mismatch flag.
5. **Import chapters.** Upload `samples/chapters.csv` or `.xlsx`, or your own file
   with the columns `name, EIN, region, district, treasurer email`. Rows are
   matched on EIN, so re-importing updates chapters without changing their links.
6. **Settings.** Change the required name format (for example
   `{Org Name} – {Chapter Name} Chapter`) and the filing window. Flags are
   recalculated right away.

### What the sample chapters show

| Status | Chapters | Why |
|---|---|---|
| 🔴 Red | Delta, Lambda | On the revocation list |
| 🔴 Red | Eta, Omicron, Alpha Beta | Last 990-N was for 2021 |
| 🔴 Red | Upsilon | EIN not in any IRS file |
| 🟡 Yellow | Zeta, Rho | IRS legal name doesn't follow the naming format |
| 🟡 Yellow | Gamma, Rho | Fiscal year ends in June or August |
| 🟡 Yellow | Iota, Psi | EIN on the determination letter differs from HQ's records |
| 🟢 Green | Alpha, Beta, Nu, Pi, Phi, Tau, Theta | Documents in, nothing flagged. Nu files a 990-EZ, so its filing comes from the BMF rather than the 990-N data |
| ⚪ Grey | Chi, Epsilon, Kappa, Mu, Omega, Sigma, Xi | Not submitted yet. Mu and Xi already show IRS flags. Chi was revoked and later reinstated, so it isn't flagged |

## How statuses are decided

Rules live in `src/lib/compliance.ts`.

- **Red:** revoked and not reinstated, EIN not in IRS data, or no 990-N or
  990/990-EZ for a period ending in the last *N* months (24 by default; set in
  Settings). Red applies whether or not the chapter has submitted.
- **Grey:** not both documents submitted yet, and nothing red.
- **Yellow:** submitted, with a name, fiscal-year, or document flag (EIN
  mismatch, or a document that couldn't be read).
- **Green:** submitted, nothing flagged.

Names are compared the way the IRS stores them: uppercase, with punctuation
ignored, and allowing for the BMF's 70-character limit.

## Document extraction

`src/lib/extraction.ts` sends each PDF or image to `claude-opus-5-5` (at low
effort) and asks for structured output: document type, EIN, organization name,
dates, and ending balance. Each value comes with its page number and the exact
text it was read from.

For PDFs with a text layer, each quoted source text is then searched for in the
PDF. If it's found, the value is marked verified, and the page is corrected if
the quote turns up on a different page. Scanned PDFs and photos can't be checked
this way.

If Claude declines a document, the request is retried automatically on another
model (`fallbacks: "default"`).

**Without an API key**, Greenlight falls back to `src/lib/text-extraction.ts`. It
reads the PDF's own text and finds labeled lines like "Employer Identification
Number:", "Statement period:" and "Ending balance". That handles the sample
PDFs and similar text-based documents, so the whole demo runs without a key.
Scans and photos can't be read this way; they're saved and marked "couldn't be
read" for manual review. HQ's detail view shows which method read each
document: the model name, "text-pattern fallback (no API key)", or
"pre-extracted demo data" for seeded documents.

Extraction runs inside the upload request (`maxDuration = 120`), so the chapter
sees the result right away. With heavy traffic, move it to a background queue.

## Project layout

```
prisma/schema.prisma        data model (chapters, documents, extracted fields, IRS tables)
prisma/seed.ts              demo seed
scripts/load-irs.ts         IRS bulk data loader
scripts/generate-samples.ts sample IRS files, chapter CSV/XLSX, demo PDFs
src/lib/irs/parse.ts        IRS file parsers
src/lib/compliance.ts       flags and status rules
src/lib/extraction.ts       Claude document extraction and source checking
src/lib/storage.ts          storage interface (local disk; S3/R2 to add)
src/lib/chapter-import.ts   CSV/XLSX chapter import
src/lib/emails.ts           reminder and education email templates
src/app/(hq)/               HQ dashboard, chapter detail, settings
src/app/c/[token]/          chapter upload page (no login)
src/app/api/                upload, import, export, and file routes
```

## Deploying to Vercel

1. **Database.** In `prisma/schema.prisma`, set `provider = "postgresql"`, then set
   `DATABASE_URL` to a Postgres connection string (for example Neon from the
   Vercel Marketplace). `src/lib/db.ts` picks the Postgres driver automatically.
   Run `npx prisma db push` against it, then the seed and IRS loader from your
   machine with the same `DATABASE_URL`.
2. **Storage.** Vercel's filesystem isn't persistent, so uploaded files would
   disappear. Implement the `Storage` interface in `src/lib/storage.ts` for
   S3 or R2 and set `STORAGE_DRIVER`. The seed's sample PDFs need it too.
3. **Environment.** Set `ANTHROPIC_API_KEY` and `APP_URL` (used to build upload links in emails).

The upload route asks for up to 120 seconds (`maxDuration`) for extraction.
Check that your Vercel plan allows a function duration that long.

## Not included (by design)

No logins or roles. Anyone with the HQ URL sees everything, and a chapter's
upload link is its only credential. Also not included: real email sending,
payments, and multi-organization support.
