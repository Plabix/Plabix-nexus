import { NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/pool";
import { requireAuth, requireRole, withErrorHandling } from "@/lib/auth/guard";
import { firstIssue } from "@/lib/validation";

export const GET = withErrorHandling(async () => {
  const { organizationId, role } = await requireAuth();
  const [organization, members] = await Promise.all([
    queryOne(
      "SELECT id, name, slug, created_at FROM organizations WHERE id = $1",
      [organizationId]
    ),
    query(
      `SELECT u.id, u.email, u.full_name, m.role, m.created_at
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1
       ORDER BY m.created_at ASC`,
      [organizationId]
    ),
  ]);
  return NextResponse.json({ organization, members, role });
});

const updateSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required.").max(200),
});

export const PATCH = withErrorHandling(async (req) => {
  const auth = await requireAuth();
  requireRole(auth, ["owner", "admin"]);
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }
  const organization = await queryOne(
    "UPDATE organizations SET name = $1 WHERE id = $2 RETURNING id, name, slug, created_at",
    [parsed.data.name, auth.organizationId]
  );
  return NextResponse.json({ organization });
});
