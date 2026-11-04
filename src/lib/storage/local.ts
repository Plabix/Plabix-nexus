import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { StorageProvider } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "_").slice(-150) || "file";
}

/** True when `target` is `root` itself or somewhere beneath it. */
export function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Stores files on local disk under <root>/<organizationId>/<uuid>-<name>.
 * Keys are paths relative to `root`. Absolute paths written by earlier
 * versions are still accepted, but only inside the allowed legacy root.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  private readonly root: string;
  private readonly legacyRoot: string;

  constructor(root: string, legacyRoot: string) {
    this.root = path.resolve(root);
    this.legacyRoot = path.resolve(legacyRoot);
  }

  async save(organizationId: string, originalFileName: string, data: Buffer): Promise<string> {
    if (!UUID_RE.test(organizationId)) throw new Error("Invalid organization id.");
    const key = path.join(organizationId, `${randomUUID()}-${sanitizeFileName(originalFileName)}`);
    const fullPath = this.resolve(key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data, { flag: "wx" });
    return key.split(path.sep).join("/");
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch (err) {
      // A file that is already gone still counts as deleted.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  /** Maps a key to a disk path, refusing anything that escapes the storage roots. */
  resolve(key: string): string {
    if (path.isAbsolute(key)) {
      const normalized = path.resolve(key);
      if (!isInside(this.legacyRoot, normalized)) throw new Error("Storage path is not allowed.");
      return normalized;
    }
    const fullPath = path.resolve(this.root, key);
    if (!isInside(this.root, fullPath) || fullPath === this.root) {
      throw new Error("Storage path is not allowed.");
    }
    return fullPath;
  }
}
