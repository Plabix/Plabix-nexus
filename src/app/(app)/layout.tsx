import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentMembership } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/pool";
import { NavSidebar } from "@/components/nav-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(user.id);
  const organization = membership
    ? await queryOne<{ name: string }>("SELECT name FROM organizations WHERE id = $1", [
        membership.organizationId,
      ])
    : null;

  return (
    <div className="min-h-screen md:flex">
      <NavSidebar
        userEmail={user.email}
        organizationName={organization?.name}
        role={membership?.role}
      />
      <main className="min-w-0 flex-1 bg-slate-50 p-4 sm:p-6 md:p-8">{children}</main>
    </div>
  );
}
