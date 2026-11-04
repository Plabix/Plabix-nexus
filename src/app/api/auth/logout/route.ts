import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { withErrorHandling } from "@/lib/auth/guard";

export const POST = withErrorHandling(async () => {
  await destroySession();
  return NextResponse.json({ success: true });
});
