import { open, readdir, readFile, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

import { writeJsonAtomic } from "../storage-utils";
import type { SessionStorage, ChannelSession } from "./storage";

export interface FileSessionStorageOptions {
  /** Root directory; sessions are stored under `{directory}/server/{channelId}.json`. */
  directory: string;
}

/**
 * Node.js file-backed {@link SessionStorage} for the batched server scheme.
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
   * Atomically updates a session only if the current `chargedCumulativeAmount` matches
   * `expectedCharged`. Uses an exclusive lockfile (`O_CREAT | O_EXCL`) so that exactly
   * one caller can hold the lock — others get `EEXIST` immediately. No TOCTOU window.
   *
   * @param channelId - The channel identifier.
   * @param expectedCharged - Expected current `chargedCumulativeAmount`.
   * @param session - The new session to store if the check passes.
   * @returns `true` if the swap succeeded, `false` if the lock was held or the value changed.
   */
  async compareAndSet(
    channelId: string,
    expectedCharged: string,
    session: ChannelSession,
  ): Promise<boolean> {
    const lockPath = this.filePath(channelId) + ".lock";
    let lockHandle;
    try {
      lockHandle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw err;
    }

    try {
      const path = this.filePath(channelId);
      try {
        const raw = await readFile(path, "utf8");
        const current = JSON.parse(raw) as ChannelSession;
        if (current.chargedCumulativeAmount !== expectedCharged) {
          return false;
        }
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw err;
      }
      await writeJsonAtomic(path, session);
      return true;
    } finally {
      await lockHandle.close();
      await unlink(lockPath).catch(() => {});
    }
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
