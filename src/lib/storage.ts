import fs from "node:fs/promises";
import path from "node:path";

/**
 * File storage behind a small interface so an S3/R2 driver can be dropped in
 * later. Keys are opaque, slash-separated paths like "chapters/<id>/<file>".
 */
export interface Storage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements Storage {
  constructor(private root: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    // Keys are generated server-side, but never let one escape the root.
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, data: Uint8Array) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

/** Vercel Blob (private store). Files are only readable through our own routes. */
class BlobStorage implements Storage {
  async put(key: string, data: Uint8Array, contentType: string) {
    const { put } = await import("@vercel/blob");
    await put(key, Buffer.from(data), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
  }

  async get(key: string) {
    const { get } = await import("@vercel/blob");
    const res = await get(key, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) throw new Error(`Blob not found: ${key}`);
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }

  async delete(key: string) {
    const { del } = await import("@vercel/blob");
    await del(key);
  }
}

// To add S3/R2: implement Storage with @aws-sdk/client-s3 (R2 is S3-compatible)
// and select it here.
let instance: Storage | null = null;

/**
 * STORAGE_DRIVER picks the driver explicitly ("local" | "blob"). Otherwise
 * Vercel Blob is used whenever its credentials are present (a connected store
 * sets BLOB_STORE_ID; a token-based store sets BLOB_READ_WRITE_TOKEN).
 */
export function storageDriver(): "local" | "blob" {
  const explicit = process.env.STORAGE_DRIVER;
  if (explicit === "local" || explicit === "blob") return explicit;
  if (explicit) throw new Error(`Storage driver "${explicit}" is not implemented`);
  return process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

export function getStorage(): Storage {
  if (instance) return instance;
  if (storageDriver() === "blob") {
    instance = new BlobStorage();
  } else {
    // Vercel's filesystem is read-only except /tmp, and /tmp isn't persistent.
    const root = process.env.STORAGE_DIR ?? (process.env.VERCEL ? "/tmp/greenlight-storage" : "./storage");
    instance = new LocalStorage(root);
  }
  return instance;
}

export function storageKey(chapterId: string, fileName: string) {
  const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(-80);
  return `chapters/${chapterId}/${Date.now()}-${safe}`;
}
