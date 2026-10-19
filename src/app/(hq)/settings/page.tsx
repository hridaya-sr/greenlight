import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Card } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";

export default async function SettingsPage() {
  const settings = await getSettings();
  const sample = await db.chapter.findFirst({ orderBy: { name: "asc" }, select: { name: true, region: true, district: true } });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">These rules drive the name and filing flags for every chapter.</p>
      </div>
      <Card>
        <SettingsForm settings={settings} sampleChapter={sample ?? { name: "Alpha", region: "Northeast", district: "District 1" }} />
      </Card>
    </div>
  );
}
