import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentOrganizationId } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/pool";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  const organizationId = await getCurrentOrganizationId(user.id);
  const org = organizationId
    ? await queryOne<{ name: string; slug: string }>(
        "SELECT name, slug FROM organizations WHERE id = $1",
        [organizationId]
      )
    : null;

  return NextResponse.json({
    user: { id: user.id, email: user.email, fullName: user.fullName },
    organization: org ? { id: organizationId, name: org.name, slug: org.slug } : null,
  });
}
