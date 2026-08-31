import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isPasswordStrongEnough } from "@/lib/auth/password";

describe("password hashing", () => {
  it("hashes and verifies correctly", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never stores the plaintext password", async () => {
    const hash = await hashPassword("my-secret-password");
    expect(hash).not.toContain("my-secret-password");
  });
});

describe("isPasswordStrongEnough", () => {
  it("rejects short passwords", () => {
    expect(isPasswordStrongEnough("short")).toBe(false);
  });

  it("accepts 8+ character passwords", () => {
    expect(isPasswordStrongEnough("longenough")).toBe(true);
  });
});
