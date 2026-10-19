import Link from "next/link";
import { Logo } from "@/components/ui";
import { NavLinks } from "@/components/nav-links";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function HqLayout({ children }: LayoutProps<"/">) {
  const settings = await getSettings();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-8 px-4 sm:px-6">
          <Link href="/"><Logo /></Link>
          <NavLinks />
          <span className="ml-auto hidden text-sm text-slate-500 sm:block">{settings.orgName} · National HQ</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
