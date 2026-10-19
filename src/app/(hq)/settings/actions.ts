"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

export type SaveState = { ok: boolean; message: string } | null;

export async function saveSettings(_prev: SaveState, form: FormData): Promise<SaveState> {
  const orgName = String(form.get("orgName") ?? "").trim();
  const namePattern = String(form.get("namePattern") ?? "").trim();
  const lookback = Number(form.get("filingLookbackMonths"));
  const hqContactName = String(form.get("hqContactName") ?? "").trim();
  const hqContactEmail = String(form.get("hqContactEmail") ?? "").trim();

  if (!orgName) return { ok: false, message: "Organization name is required." };
  if (!namePattern.includes("{Chapter Name}")) return { ok: false, message: "The naming pattern must include {Chapter Name}." };
  if (!Number.isInteger(lookback) || lookback < 6 || lookback > 60) return { ok: false, message: "Filing window must be 6–60 months." };

  const data = { orgName, namePattern, filingLookbackMonths: lookback, hqContactName, hqContactEmail };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. Flags are recalculated with the new settings." };
}
