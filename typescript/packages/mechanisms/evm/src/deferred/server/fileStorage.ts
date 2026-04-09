import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { writeJsonAtomic } from "../storage-utils";
import type { SessionStorage, ChannelSession } from "./storage";

export interface FileSessionStorageOptions {
  /** Root directory; sessions are stored under `{directory}/server/{channelId}.json`. */
  directory: string;
}

/**
 * Node.js file-backed {@link SessionStorage} for the batch-settlement server scheme.
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
   * Loads a persisted channel session, if present.
   *
   * @param channelId - The channel identifier (path segment is lowercased).
   * @returns Parsed session or `undefined` when the file is missing.
   */
  async get(channelId: string): Promise<ChannelSession | undefined> {
    const path = this.filePath(channelId);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as ChannelSession;
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
   * Persists a channel session.
   *
   * @param channelId - The channel identifier.
   * @param session - Session record to write.
   */
  async set(channelId: string, session: ChannelSession): Promise<void> {
    await writeJsonAtomic(this.filePath(channelId), session);
  }

  /**
   * Removes the persisted session file for a channel, if it exists.
   *
   * @param channelId - The channel identifier.
   */
  async delete(channelId: string): Promise<void> {
    try {
      await unlink(this.filePath(channelId));
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
   * Lists all stored sessions by reading the server directory.
   *
   * @returns Sessions sorted by channelId; empty array if the directory is missing.
   */
  async list(): Promise<ChannelSession[]> {
    const dir = join(this.root, "server");
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

    const sessions: ChannelSession[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const path = join(dir, name);
      try {
        const raw = await readFile(path, "utf8");
        sessions.push(JSON.parse(raw) as ChannelSession);
      } catch {
        /* skip unreadable entries */
      }
    }
    return sessions.sort((a, b) => a.channelId.localeCompare(b.channelId));
  }

  /**
   * Absolute path to the JSON file for a channel.
   *
   * @param channelId - The channel identifier.
   * @returns Filesystem path under `{root}/server/...`.
   */
  private filePath(channelId: string): string {
    return join(this.root, "server", `${channelId.toLowerCase()}.json`);
  }
}
