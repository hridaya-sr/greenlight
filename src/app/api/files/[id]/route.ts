import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";

// Serves a submitted document to HQ. (No auth in this MVP.)
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  const data = await getStorage().get(doc.storageKey);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${doc.originalName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
