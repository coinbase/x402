import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { writeJsonAtomic } from "../storage-utils";
import type { ClientSessionStorage, DeferredClientContext } from "./storage";

export interface FileClientSessionStorageOptions {
  /** Root directory; sessions are stored under `{directory}/client/{serviceId}/{payer}.json`. */
  directory: string;
}

/**
 * Node.js file-backed {@link ClientSessionStorage}. For browser builds use {@link InMemoryClientSessionStorage}.
 *
 * Expects storage keys shaped as `serviceId:payer` (same composite key as the deferred client scheme).
 */
export class FileClientSessionStorage implements ClientSessionStorage {
  private readonly root: string;

  /**
   * Creates file-backed client session storage under the given root directory.
   *
   * @param options - Configuration including the storage root directory.
   */
  constructor(options: FileClientSessionStorageOptions) {
    this.root = options.directory;
  }

  /**
   * Parses a composite session key into normalized path components.
   *
   * @param key - Session key `serviceId:payer`.
   * @returns Lowercased `serviceId` and `payer` segments.
   */
  private static parseKey(key: string): { serviceId: string; payer: string } {
    const idx = key.indexOf(":");
    if (idx <= 0 || idx === key.length - 1) {
      throw new Error(
        `FileClientSessionStorage: invalid session key (expected "serviceId:payer"): ${key.slice(0, 80)}`,
      );
    }
    const serviceId = key.slice(0, idx).toLowerCase();
    const payer = key.slice(idx + 1).toLowerCase();
    return { serviceId, payer };
  }

  /**
   * Loads persisted client session context for the composite key, if present.
   *
   * @param key - Session key `serviceId:payer` (lowercased when resolved to paths).
   * @returns Parsed session or `undefined` when the file is missing.
   */
  async get(key: string): Promise<DeferredClientContext | undefined> {
    const path = this.filePath(key);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as DeferredClientContext;
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      if (code === "ENOENT") return undefined;
      throw err;
    }
  }

  /**
   * Persists client session context for the composite key.
   *
   * @param key - Session key `serviceId:payer`.
   * @param context - Client session fields to write.
   */
  async set(key: string, context: DeferredClientContext): Promise<void> {
    await writeJsonAtomic(this.filePath(key), context);
  }

  /**
   * Removes the persisted session file for the key, if it exists.
   *
   * @param key - Session key `serviceId:payer`.
   */
  async delete(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key));
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      if (code === "ENOENT") return;
      throw err;
    }
  }

  /**
   * Absolute path to the JSON file for a session key.
   *
   * @param key - Session key `serviceId:payer`.
   * @returns Filesystem path under `{root}/client/...`.
   */
  private filePath(key: string): string {
    const { serviceId, payer } = FileClientSessionStorage.parseKey(key);
    return join(this.root, "client", serviceId, `${payer}.json`);
  }
}
