import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStorageProvider, sanitizeFileName } from "@/lib/storage/local";

const ORG = "11111111-1111-4111-8111-111111111111";

describe("LocalStorageProvider", () => {
  let base: string;
  let storage: LocalStorageProvider;

  beforeAll(async () => {
    base = await mkdtemp(path.join(tmpdir(), "plabix-storage-"));
    storage = new LocalStorageProvider(path.join(base, "documents"), base);
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("saves, reads and deletes a file using a relative key", async () => {
    const key = await storage.save(ORG, "policy.txt", Buffer.from("hello"));
    expect(path.isAbsolute(key)).toBe(false);
    expect(key.startsWith(`${ORG}/`)).toBe(true);
    expect((await storage.read(key)).toString()).toBe("hello");
    await storage.delete(key);
    await expect(storage.read(key)).rejects.toThrow();
  });

  it("treats deleting a missing file as success", async () => {
    await expect(storage.delete(`${ORG}/missing.txt`)).resolves.toBeUndefined();
  });

  it("refuses keys that escape the storage root", () => {
    expect(() => storage.resolve("../../secret.txt")).toThrow(/not allowed/);
    expect(() => storage.resolve(`${ORG}/../../../secret.txt`)).toThrow(/not allowed/);
  });

  it("accepts legacy absolute paths only inside the legacy root", () => {
    const inside = path.join(base, "seed", "file.txt");
    expect(storage.resolve(inside)).toBe(path.resolve(inside));
    expect(() => storage.resolve(path.resolve(tmpdir(), "elsewhere.txt"))).toThrow(/not allowed/);
  });

  it("rejects an invalid organization id", async () => {
    await expect(storage.save("../evil", "a.txt", Buffer.from("x"))).rejects.toThrow();
  });
});

describe("sanitizeFileName", () => {
  it("removes path separators and unsafe characters", () => {
    expect(sanitizeFileName("../a b/c?.txt")).toBe("c_.txt");
    expect(sanitizeFileName("..hidden")).toBe("_hidden");
  });
});
