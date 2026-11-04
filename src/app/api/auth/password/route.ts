import { NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/pool";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { HttpError, requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { firstIssue } from "@/lib/validation";
import { rateLimit } from "@/lib/security/rate-limit";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters.")
    .max(72, "New password must be at most 72 characters."),
});

/** Changes the password and signs out every other session. */
export const POST = withErrorHandling(async (req) => {
  const { userId } = await requireAuth();
  if (!rateLimit(`password:${userId}`, 5, 15 * 60 * 1000).allowed) {
    throw new HttpError("Too many attempts. Please wait and try again.", 429);
  }

  const parsed = changePasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const user = await queryOne<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = $1",
    [userId]
  );
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.password_hash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [
    await hashPassword(parsed.data.newPassword),
    userId,
  ]);
  await query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await createSession(userId);
  return NextResponse.json({ success: true });
});
