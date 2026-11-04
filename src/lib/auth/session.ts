import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { query, queryOne } from "@/lib/db/pool";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "plabix_session";
const MAX_AGE_SECONDS = Number(process.env.SESSION_MAX_AGE_SECONDS || 604_800);

export type MembershipRole = "owner" | "admin" | "member";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
}

/**
 * Tokens are 256-bit random values; only a keyed hash is stored, so a
 * database leak does not reveal usable session tokens.
 */
function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET || "";
  return createHash("sha256").update(token + secret).digest("hex");
}

function shouldUseSecureCookies(): boolean {
  if (process.env.SESSION_COOKIE_SECURE === "true") return true;
  if (process.env.SESSION_COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

/** Creates a new session for a user and sets the session cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);

  // Opportunistic cleanup so the sessions table doesn't grow forever.
  await query("DELETE FROM sessions WHERE expires_at < now()");
  await query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt]
  );

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Reads the session cookie and returns the authenticated user, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;

  const tokenHash = hashToken(token);
  const row = await queryOne<{
    user_id: string;
    email: string;
    full_name: string | null;
  }>(
    `SELECT u.id AS user_id, u.email, u.full_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash]
  );

  if (!row) return null;
  return { id: row.user_id, email: row.email, fullName: row.full_name };
}

/** Invalidates the current session (server-side) and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  cookieStore.delete(COOKIE_NAME);
}

/** Returns the current user's default (first) organization membership. */
export async function getCurrentMembership(
  userId: string
): Promise<{ organizationId: string; role: MembershipRole } | null> {
  const row = await queryOne<{ organization_id: string; role: MembershipRole }>(
    "SELECT organization_id, role FROM memberships WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1",
    [userId]
  );
  return row ? { organizationId: row.organization_id, role: row.role } : null;
}

export async function getCurrentOrganizationId(userId: string): Promise<string | null> {
  return (await getCurrentMembership(userId))?.organizationId ?? null;
}
