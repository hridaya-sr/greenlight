import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here shows live, per-request compliance data, so we use plain
  // dynamic rendering rather than Cache Components / partial prerendering.
  serverExternalPackages: ["better-sqlite3", "unpdf", "exceljs"],
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
