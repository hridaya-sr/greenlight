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

// To add S3/R2: implement Storage with @aws-sdk/client-s3 (R2 is S3-compatible),
// then return it here when STORAGE_DRIVER === "s3".
let instance: Storage | null = null;

export function getStorage(): Storage {
  if (instance) return instance;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") throw new Error(`Storage driver "${driver}" is not implemented yet`);
  // Vercel's filesystem is read-only except /tmp (and /tmp is not persistent).
  const root = process.env.STORAGE_DIR ?? (process.env.VERCEL ? "/tmp/greenlight-storage" : "./storage");
  instance = new LocalStorage(root);
  return instance;
}

export function storageKey(chapterId: string, fileName: string) {
  const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(-80);
  return `chapters/${chapterId}/${Date.now()}-${safe}`;
}
