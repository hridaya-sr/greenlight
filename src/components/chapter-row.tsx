"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** A table row that opens the chapter detail view when clicked anywhere. */
export function ChapterRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(href);
      }}
      className="cursor-pointer hover:bg-slate-50"
    >
      {children}
    </tr>
  );
}
