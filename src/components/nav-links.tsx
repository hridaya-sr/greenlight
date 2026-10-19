"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Chapters" },
  { href: "/settings", label: "Settings" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex gap-1">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" || path.startsWith("/chapters") : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:text-slate-900"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
