import { NextResponse } from "next/server";
import { withTransaction, queryOne } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { signupSchema } from "@/lib/validation";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "org"
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  const { email, password, fullName, organizationName } = parsed.data;

  const existing = await queryOne("SELECT id FROM users WHERE email = $1", [
    email.toLowerCase(),
  ]);
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const baseSlug = slugify(organizationName);

  try {
    const userId = await withTransaction(async (client) => {
      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, full_name)
         VALUES ($1, $2, $3) RETURNING id`,
        [email.toLowerCase(), passwordHash, fullName ?? null]
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

    await createSession(userId);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Signup failed:", err);
    return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
  }
}
