import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { NavSidebar } from "@/components/nav-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <NavSidebar userEmail={user.email} />
      <main className="flex-1 bg-slate-50 p-6 md:p-8">{children}</main>
    </div>
  );
}
