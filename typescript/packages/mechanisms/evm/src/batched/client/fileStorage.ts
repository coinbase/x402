import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { writeJsonAtomic } from "../storage-utils";
import type { ClientSessionStorage, DeferredClientContext } from "./storage";

export interface FileClientSessionStorageOptions {
  /** Root directory; sessions are stored under `{directory}/client/{channelId}.json`. */
  directory: string;
}

/**
 * Node.js file-backed {@link ClientSessionStorage} for the batch-settlement client scheme.
 * Each channel's context is persisted as `{root}/client/{channelId}.json` so that sessions
 * survive process restarts.
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
   * Loads the stored client context for a channel, if present.
   *
   * @param key - Channel storage key (typically a lowercased channelId).
   * @returns Parsed context or `undefined` when the file is missing.
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
   * Persists the client context for a channel.
   *
   * @param key - Channel storage key.
   * @param context - Context record to write.
   */
  async set(key: string, context: DeferredClientContext): Promise<void> {
    await writeJsonAtomic(this.filePath(key), context);
  }

  /**
   * Removes the persisted context file for a channel, if it exists.
   *
   * @param key - Channel storage key.
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
   * Absolute path to the JSON file for a channel.
   *
   * @param key - Channel storage key.
   * @returns Filesystem path under `{root}/client/...`.
   */
  private filePath(key: string): string {
    return join(this.root, "client", `${key.toLowerCase()}.json`);
  }
}
