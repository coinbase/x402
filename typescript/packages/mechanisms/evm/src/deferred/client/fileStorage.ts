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

  constructor(options: FileClientSessionStorageOptions) {
    this.root = options.directory;
  }

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

  private filePath(key: string): string {
    const { serviceId, payer } = FileClientSessionStorage.parseKey(key);
    return join(this.root, "client", serviceId, `${payer}.json`);
  }

  async get(key: string): Promise<DeferredClientContext | undefined> {
    const path = this.filePath(key);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as DeferredClientContext;
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (code === "ENOENT") return undefined;
      throw err;
    }
  }

  async set(key: string, context: DeferredClientContext): Promise<void> {
    await writeJsonAtomic(this.filePath(key), context);
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key));
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (code === "ENOENT") return;
      throw err;
    }
  }
}
