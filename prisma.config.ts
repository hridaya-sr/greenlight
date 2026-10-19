import "dotenv/config";
import fs from "node:fs";
import { defineConfig } from "prisma/config";

// prisma/schema.prisma is the only schema to edit. It targets SQLite for local
// dev. When DATABASE_URL points at Postgres (e.g. Neon on Vercel), we derive
// prisma/schema.postgres.prisma (gitignored) with the provider swapped, so the
// same models generate a Postgres client.
const url = process.env.DATABASE_URL ?? "file:./dev.db";
let schema = "prisma/schema.prisma";
if (/^postgres(ql)?:\/\//.test(url)) {
  const source = fs.readFileSync(schema, "utf8");
  const pg = source.replace(/(datasource db \{[^}]*provider\s*=\s*)"sqlite"/, '$1"postgresql"');
  if (pg === source) throw new Error('Could not find provider = "sqlite" in prisma/schema.prisma');
  schema = "prisma/schema.postgres.prisma";
  fs.writeFileSync(schema, `// GENERATED from schema.prisma by prisma.config.ts. Do not edit.\n${pg}`);
}

export default defineConfig({
  schema,
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
