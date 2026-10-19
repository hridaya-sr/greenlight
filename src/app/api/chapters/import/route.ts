import { NextResponse } from "next/server";
import { importChapters } from "@/lib/chapter-import";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "File is larger than 5 MB" }, { status: 400 });
  try {
    const result = await importChapters(file.name, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 400 });
  }
}
