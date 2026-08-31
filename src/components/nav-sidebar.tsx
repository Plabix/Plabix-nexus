"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/documents", label: "Documents" },
  { href: "/chat", label: "AI Chat" },
  { href: "/organization", label: "Organization" },
  { href: "/usage", label: "Usage" },
  { href: "/settings", label: "Settings" },
];

export function NavSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-64 flex-col border-r border-slate-200 bg-white p-5">
      <div className="mb-8">
        <p className="text-lg font-bold text-slate-900">Plabix Nexus</p>
        <p className="text-xs text-slate-500">AI knowledge OS</p>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "block rounded-lg px-3 py-2 text-sm font-medium transition",
              pathname === item.href
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <p className="truncate text-xs text-slate-500">{userEmail}</p>
        <button onClick={handleLogout} className="mt-2 text-sm font-medium text-red-600">
          Log out
        </button>
      </div>
    </aside>
  );
}
