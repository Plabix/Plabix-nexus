import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local";

let storage: StorageProvider | null = null;

/**
 * Returns the configured storage backend. Only local disk is implemented;
 * add an S3-compatible provider here (selected by STORAGE_PROVIDER) when needed.
 */
export function getStorage(): StorageProvider {
  if (!storage) {
    storage = new LocalStorageProvider(
      process.env.UPLOAD_DIR || "./storage/documents",
      process.env.STORAGE_LEGACY_ROOT || "./storage"
    );
  }
  return storage;
}

export type { StorageProvider } from "./types";
