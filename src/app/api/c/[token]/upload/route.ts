import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, processDocument, type AcceptedType } from "@/lib/extraction";
import { getStorage, storageKey } from "@/lib/storage";

// Extraction runs inside the request; allow time for Claude to read the document.
export const maxDuration = 120;

const KINDS = ["determination_letter", "financial"] as const;

export async function POST(req: Request, ctx: RouteContext<"/api/c/[token]/upload">) {
  const { token } = await ctx.params;
  const chapter = await db.chapter.findUnique({ where: { token } });
  if (!chapter) return NextResponse.json({ error: "This upload link isn't valid." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (!KINDS.includes(kind as (typeof KINDS)[number])) return NextResponse.json({ error: "Unknown document type." }, { status: 400 });
  if (!(file.type in ACCEPTED_TYPES)) {
    return NextResponse.json({ error: "Upload a PDF or an image (PNG, JPEG, WebP, or GIF)." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files must be 20 MB or smaller." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = storageKey(chapter.id, file.name);
  await getStorage().put(key, bytes, file.type);
  const doc = await db.document.create({
    data: {
      chapterId: chapter.id,
      kind: kind as string,
      originalName: file.name,
      mimeType: file.type as AcceptedType,
      sizeBytes: file.size,
      storageKey: key,
    },
  });

  await processDocument(doc.id);
  const done = await db.document.findUnique({ where: { id: doc.id }, include: { fields: { orderBy: { sortOrder: "asc" } } } });
  return NextResponse.json({ document: done });
}
