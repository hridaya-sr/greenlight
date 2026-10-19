import { db } from "@/lib/db";
import { SAMPLE_NAME_PATTERN, SAMPLE_ORG_NAME } from "@/lib/sample/chapters";

export const DEFAULT_SETTINGS = {
  orgName: SAMPLE_ORG_NAME,
  namePattern: SAMPLE_NAME_PATTERN,
  filingLookbackMonths: 24,
};

export async function getSettings() {
  return db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, ...DEFAULT_SETTINGS } });
}

export type AppSettings = Awaited<ReturnType<typeof getSettings>>;
