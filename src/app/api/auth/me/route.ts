import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentMembership } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/pool";
import { withErrorHandling } from "@/lib/auth/guard";

export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  const membership = await getCurrentMembership(user.id);
  const org = membership
    ? await queryOne<{ name: string; slug: string }>(
        "SELECT name, slug FROM organizations WHERE id = $1",
        [membership.organizationId]
      )
    : null;

  return NextResponse.json({
    user: { id: user.id, email: user.email, fullName: user.fullName },
    organization:
      org && membership
        ? { id: membership.organizationId, name: org.name, slug: org.slug, role: membership.role }
        : null,
  });
});
