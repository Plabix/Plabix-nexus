import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentOrganizationId } from "./session";

export class UnauthorizedError extends Error {}

/**
 * Every authenticated API route calls this first. Returns the user and
 * their organization id (the tenant-isolation boundary). Throws if either
 * is missing so routes fail closed, not open.
 */
export async function requireAuth(): Promise<{ userId: string; organizationId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError("Not authenticated.");

  const organizationId = await getCurrentOrganizationId(user.id);
  if (!organizationId) throw new UnauthorizedError("No organization membership found.");

  return { userId: user.id, organizationId };
}

/** Wraps a route handler, converting known auth/validation errors to responses. */
export function withErrorHandling(
  handler: (req: Request, ctx: unknown) => Promise<NextResponse>
) {
  return async (req: Request, ctx: unknown): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return NextResponse.json({ error: err.message }, { status: 401 });
      }
      // eslint-disable-next-line no-console
      console.error("Unhandled API error:", err);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }
  };
}
