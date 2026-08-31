import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema, askQuestionSchema } from "@/lib/validation";

describe("signupSchema", () => {
  it("accepts valid input", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "password123",
      organizationName: "Acme Inc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = signupSchema.safeParse({
      email: "not-an-email",
      password: "password123",
      organizationName: "Acme Inc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short passwords", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "short",
      organizationName: "Acme Inc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing organization name", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials shape", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "x" }).success
    ).toBe(true);
  });
});

describe("askQuestionSchema", () => {
  it("rejects empty questions", () => {
    expect(askQuestionSchema.safeParse({ question: "" }).success).toBe(false);
  });

  it("accepts a normal question", () => {
    expect(
      askQuestionSchema.safeParse({ question: "How many leave days do I get?" }).success
    ).toBe(true);
  });
});
