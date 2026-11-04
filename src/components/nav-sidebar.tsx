"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { href: "/documents", label: "Documents", icon: "M7 3h7l5 5v13H7zM14 3v5h5" },
  { href: "/chat", label: "AI Chat", icon: "M4 5h16v11H8l-4 4z" },
  { href: "/organization", label: "Organization", icon: "M4 21V7l8-4 8 4v14M9 21v-6h6v6" },
  { href: "/usage", label: "Usage & Health", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2" },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

export function NavSidebar({
  userEmail,
  organizationName,
  role,
}: {
  userEmail: string;
  organizationName?: string;
  role?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <p className="font-bold text-slate-900">Plabix Nexus</p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
          aria-expanded={open}
          aria-controls="app-nav"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <aside
        id="app-nav"
        className={clsx(
          "flex-col border-r border-slate-200 bg-white p-5 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0",
          open ? "flex" : "hidden"
        )}
      >
        <div className="mb-8 hidden md:block">
          <p className="text-lg font-bold text-slate-900">Plabix Nexus</p>
          <p className="text-xs text-slate-500">AI knowledge OS</p>
        </div>

        {organizationName && (
          <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-800">{organizationName}</p>
            {role && <p className="text-xs capitalize text-slate-500">{role}</p>}
          </div>
        )}

        <nav className="flex-1 space-y-1" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={clsx(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive(item.href)
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <NavIcon path={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="truncate text-xs text-slate-500">{userEmail}</p>
          <button onClick={handleLogout} className="mt-2 text-sm font-medium text-red-600 hover:underline">
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
