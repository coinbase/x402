import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { writeJsonAtomic } from "../storage-utils";
import type { SessionStorage, SubchannelSession } from "./storage";

export interface FileSessionStorageOptions {
  /** Root directory; sessions are stored under `{directory}/server/{serviceId}/{payer}.json`. */
  directory: string;
}

/**
 * Node.js file-backed {@link SessionStorage} for the deferred server scheme.
 */
export class FileSessionStorage implements SessionStorage {
  private readonly root: string;

  /**
   * Creates file-backed server session storage under the given root directory.
   *
   * @param options - Configuration including the storage root directory.
   */
  constructor(options: FileSessionStorageOptions) {
    this.root = options.directory;
  }

  /**
   * Loads a persisted subchannel session for the service and payer, if present.
   *
   * @param serviceId - On-chain service id (path segment is lowercased).
   * @param payer - Payer address (path segment is lowercased).
   * @returns Parsed session or `undefined` when the file is missing.
   */
  async get(serviceId: string, payer: string): Promise<SubchannelSession | undefined> {
    const path = this.filePath(serviceId, payer);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as SubchannelSession;
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
   * Persists a subchannel session for the service and payer.
   *
   * @param serviceId - On-chain service id.
   * @param payer - Payer address.
   * @param session - Session record to write.
   */
  async set(serviceId: string, payer: string, session: SubchannelSession): Promise<void> {
    await writeJsonAtomic(this.filePath(serviceId, payer), session);
  }

  /**
   * Removes the persisted session file for the service and payer, if it exists.
   *
   * @param serviceId - On-chain service id.
   * @param payer - Payer address.
   */
  async delete(serviceId: string, payer: string): Promise<void> {
    try {
      await unlink(this.filePath(serviceId, payer));
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
   * Lists all stored sessions for a service id by reading the service directory.
   *
   * @param serviceId - On-chain service id (directory name is lowercased).
   * @returns Sessions sorted by payer; empty array if the directory is missing.
   */
  async list(serviceId: string): Promise<SubchannelSession[]> {
    const sid = serviceId.toLowerCase();
    const dir = join(this.root, "server", sid);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      if (code === "ENOENT") return [];
      throw err;
    }

    const sessions: SubchannelSession[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const path = join(dir, name);
      try {
        const raw = await readFile(path, "utf8");
        sessions.push(JSON.parse(raw) as SubchannelSession);
      } catch {
        /* skip unreadable entries */
      }
    }
    return sessions.sort((a, b) => a.payer.localeCompare(b.payer));
  }

  /**
   * Normalizes ids for stable filesystem paths.
   *
   * @param serviceId - Raw service id.
   * @param payer - Raw payer address.
   * @returns Lowercased pair used in paths.
   */
  private normalized(serviceId: string, payer: string): { serviceId: string; payer: string } {
    return { serviceId: serviceId.toLowerCase(), payer: payer.toLowerCase() };
  }

  /**
   * Absolute path to the JSON file for a service/payer pair.
   *
   * @param serviceId - On-chain service id.
   * @param payer - Payer address.
   * @returns Filesystem path under `{root}/server/...`.
   */
  private filePath(serviceId: string, payer: string): string {
    const { serviceId: sid, payer: p } = this.normalized(serviceId, payer);
    return join(this.root, "server", sid, `${p}.json`);
  }
}
