import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/security/rate-limit";
import { assertSameOrigin, parseId, ForbiddenError, NotFoundError } from "@/lib/auth/guard";
import { findInsecureConfig } from "@/lib/config-check";
import { verifyAgainstDummy } from "@/lib/auth/password";
import { signupSchema } from "@/lib/validation";

describe("rateLimit", () => {
  it("allows up to the limit within a window, then blocks", () => {
    const key = `test-${Math.random()}`;
    const now = 1_000_000;
    expect(rateLimit(key, 2, 60_000, now).allowed).toBe(true);
    expect(rateLimit(key, 2, 60_000, now).allowed).toBe(true);
    const blocked = rateLimit(key, 2, 60_000, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
    expect(rateLimit(key, 2, 60_000, now + 60_001).allowed).toBe(true);
  });
});

describe("assertSameOrigin", () => {
  const request = (method: string, headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/documents", { method, headers });

  it("allows same-origin mutations and requests without an Origin header", () => {
    expect(() =>
      assertSameOrigin(request("POST", { origin: "http://localhost:3000", host: "localhost:3000" }))
    ).not.toThrow();
    expect(() => assertSameOrigin(request("DELETE", { host: "localhost:3000" }))).not.toThrow();
  });

  it("rejects cross-origin mutations", () => {
    expect(() =>
      assertSameOrigin(request("POST", { origin: "https://evil.example", host: "localhost:3000" }))
    ).toThrow(ForbiddenError);
  });

  it("ignores safe methods", () => {
    expect(() =>
      assertSameOrigin(request("GET", { origin: "https://evil.example", host: "localhost:3000" }))
    ).not.toThrow();
  });
});

describe("parseId", () => {
  it("accepts UUIDs and turns anything else into a 404", () => {
    expect(parseId("2b1a6ec6-ceb9-467b-8aec-5aefb2ab4a95")).toBe("2b1a6ec6-ceb9-467b-8aec-5aefb2ab4a95");
    expect(() => parseId("1 OR 1=1")).toThrow(NotFoundError);
    expect(() => parseId(undefined)).toThrow(NotFoundError);
  });
});

describe("findInsecureConfig", () => {
  it("flags a placeholder or short session secret", () => {
    expect(
      findInsecureConfig({ SESSION_SECRET: "replace-this-with-a-long-random-secret", DATABASE_URL: "x" } as unknown as NodeJS.ProcessEnv)
    ).toHaveLength(1);
    expect(findInsecureConfig({ SESSION_SECRET: "short", DATABASE_URL: "x" } as unknown as NodeJS.ProcessEnv)).toHaveLength(1);
  });

  it("passes a strong configuration", () => {
    expect(
      findInsecureConfig({ SESSION_SECRET: "a".repeat(43), DATABASE_URL: "postgres://x" } as unknown as NodeJS.ProcessEnv)
    ).toEqual([]);
  });
});

describe("password handling", () => {
  it("dummy verification always fails", async () => {
    expect(await verifyAgainstDummy("anything")).toBe(false);
  });

  it("normalizes email case and rejects passwords bcrypt would truncate", () => {
    const ok = signupSchema.parse({ email: " User@Example.COM ", password: "password123", organizationName: "Acme" });
    expect(ok.email).toBe("user@example.com");
    expect(
      signupSchema.safeParse({ email: "a@b.com", password: "x".repeat(73), organizationName: "Acme" }).success
    ).toBe(false);
  });
});
