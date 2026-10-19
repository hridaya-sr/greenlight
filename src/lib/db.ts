import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

// Pick the driver adapter from DATABASE_URL so the same code runs on local
// SQLite and on Postgres (Vercel). The schema's `provider` must match.
function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = url.startsWith("postgres")
    ? new PrismaPg({ connectionString: url })
    : new PrismaBetterSqlite3({ url: url.replace(/^file:/, "") });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
