"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function FilterBar({
  places,
  region,
  district,
}: {
  places: { region: string; district: string }[];
  region?: string;
  district?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const regions = [...new Set(places.map((p) => p.region))];
  const districts = [...new Set(places.filter((p) => !region || p.region === region).map((p) => p.district))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true }),
  );

  const set = (key: "region" | "district", value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // A district only makes sense inside its region
    if (key === "region" && value && !places.some((p) => p.region === value && p.district === district)) next.delete("district");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const select =
    "rounded-lg border-0 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-emerald-600";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Region" className={select} value={region ?? ""} onChange={(e) => set("region", e.target.value)}>
        <option value="">All regions</option>
        {regions.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <select aria-label="District" className={select} value={district ?? ""} onChange={(e) => set("district", e.target.value)}>
        <option value="">All districts</option>
        {districts.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      {(region || district) && (
        <button
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
          onClick={() => {
            const next = new URLSearchParams(params);
            next.delete("region");
            next.delete("district");
            const qs = next.toString();
            router.push(qs ? `${pathname}?${qs}` : pathname);
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
