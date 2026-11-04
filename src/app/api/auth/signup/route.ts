import { NextResponse } from "next/server";
import { withTransaction, queryOne } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { HttpError, withErrorHandling } from "@/lib/auth/guard";
import { firstIssue, signupSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "org"
  );
}

const ACCOUNT_EXISTS = "An account with this email already exists.";

export const POST = withErrorHandling(async (req) => {
  const ip = clientIp(req);
  const limit = ip ? rateLimit(`signup:${ip}`, 10, 60 * 60 * 1000) : null;
  if (limit && !limit.allowed) {
    throw new HttpError("Too many sign-up attempts. Please try again later.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }
  const { email, password, fullName, organizationName } = parsed.data;

  const existing = await queryOne("SELECT id FROM users WHERE email = $1", [email]);
  if (existing) {
    return NextResponse.json({ error: ACCOUNT_EXISTS }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const baseSlug = slugify(organizationName);

  let userId: string;
  try {
    userId = await withTransaction(async (client) => {
      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES ($1, $2, $3) RETURNING id`,
        [email, passwordHash, fullName || null]
      );
      const newUserId = userResult.rows[0]!.id;

      // Ensure slug uniqueness with a numeric suffix if needed.
      let slug = baseSlug;
      let suffix = 1;
      for (;;) {
        const slugCheck = await client.query("SELECT id FROM organizations WHERE slug = $1", [
          slug,
        ]);
        if (slugCheck.rows.length === 0) break;
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }

      const orgResult = await client.query<{ id: string }>(
        "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id",
        [organizationName, slug]
      );
      const organizationId = orgResult.rows[0]!.id;

      await client.query(
        `INSERT INTO memberships (user_id, organization_id, role)
         VALUES ($1, $2, 'owner')`,
        [newUserId, organizationId]
      );

      return newUserId;
    });
  } catch (err) {
    // Two simultaneous sign-ups with the same email: the unique index wins.
    const pgError = err as { code?: string; constraint?: string };
    if (pgError.code === "23505" && pgError.constraint === "users_email_key") {
      return NextResponse.json({ error: ACCOUNT_EXISTS }, { status: 409 });
    }
    throw err;
  }

  await createSession(userId);
  return NextResponse.json({ success: true }, { status: 201 });
});
