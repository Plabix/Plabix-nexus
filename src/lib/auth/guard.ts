import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentMembership, type MembershipRole } from "./session";
import { AIProviderError } from "@/lib/ai/types";
import { FileValidationError } from "@/lib/files";
import { uuidSchema } from "@/lib/validation";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly headers?: Record<string, string>
  ) {
    super(message);
  }
}

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: MembershipRole;
}

/**
 * Every authenticated API route calls this first. Returns the user and
 * their organization id (the tenant-isolation boundary). Throws if either
 * is missing so routes fail closed, not open.
 */
export async function requireAuth(): Promise<AuthContext> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError("Not authenticated.");

  const membership = await getCurrentMembership(user.id);
  if (!membership) throw new UnauthorizedError("No organization membership found.");

  return { userId: user.id, organizationId: membership.organizationId, role: membership.role };
}

export function requireRole(auth: AuthContext, roles: MembershipRole[]): void {
  if (!roles.includes(auth.role)) {
    throw new ForbiddenError("You don't have permission to do that.");
  }
}

/** Route ids are UUIDs; anything else can't exist, so it is a 404, not a DB error. */
export function parseId(id: string | undefined): string {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new NotFoundError("Not found.");
  return parsed.data;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Rejects cross-site state-changing requests. SameSite=Lax cookies already
 * block most CSRF; this is defense in depth for older browsers and same-site
 * subdomains.
 */
export function assertSameOrigin(req: Request): void {
  if (!UNSAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, tests) send no Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError("Invalid request origin.");
  }
  if (!host || originHost !== host) throw new ForbiddenError("Cross-origin request rejected.");
}

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a route handler: enforces same-origin for mutations, resolves Next's
 * async params, and converts known errors into safe JSON responses.
 */
export function withErrorHandling<P = Record<string, string>>(
  handler: (req: Request, params: P) => Promise<NextResponse>
) {
  return async (req: Request, ctx: RouteContext<P>): Promise<NextResponse> => {
    try {
      assertSameOrigin(req);
      const params = ((await ctx?.params) ?? {}) as P;
      return await handler(req, params);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return NextResponse.json({ error: err.message }, { status: 401 });
      }
      if (err instanceof ForbiddenError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      if (err instanceof NotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (err instanceof FileValidationError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status, headers: err.headers });
      }
      if (err instanceof AIProviderError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      console.error("Unhandled API error:", err instanceof Error ? err.stack ?? err.message : err);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }
  };
}
