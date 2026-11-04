import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db/pool";
import { verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { HttpError, withErrorHandling } from "@/lib/auth/guard";
import { firstIssue, loginSchema } from "@/lib/validation";
import { clientIp, rateLimit, resetRateLimit } from "@/lib/security/rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

export const POST = withErrorHandling(async (req) => {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }
  const { email, password } = parsed.data;

  // Per account limits password guessing; per IP (when known via a trusted
  // proxy) limits credential stuffing across many accounts.
  const ip = clientIp(req);
  const accountKey = `login:${email}`;
  const limits: [string, number][] = [[accountKey, 10]];
  if (ip) limits.push([`login-ip:${ip}`, 100]);
  for (const [key, limit] of limits) {
    const result = rateLimit(key, limit, WINDOW_MS);
    if (!result.allowed) {
      throw new HttpError("Too many login attempts. Please wait and try again.", 429, {
        "Retry-After": String(result.retryAfterSeconds),
      });
    }
  }

  const user = await queryOne<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email]
  );

  // Same response and similar timing whether or not the email exists.
  const valid = user
    ? await verifyPassword(password, user.password_hash)
    : await verifyAgainstDummy(password);
  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  resetRateLimit(accountKey);
  await createSession(user.id);
  return NextResponse.json({ success: true });
});
