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

  constructor(options: FileSessionStorageOptions) {
    this.root = options.directory;
  }

  private normalized(serviceId: string, payer: string): { serviceId: string; payer: string } {
    return { serviceId: serviceId.toLowerCase(), payer: payer.toLowerCase() };
  }

  private filePath(serviceId: string, payer: string): string {
    const { serviceId: sid, payer: p } = this.normalized(serviceId, payer);
    return join(this.root, "server", sid, `${p}.json`);
  }

  async get(serviceId: string, payer: string): Promise<SubchannelSession | undefined> {
    const path = this.filePath(serviceId, payer);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as SubchannelSession;
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (code === "ENOENT") return undefined;
      throw err;
    }
  }

  async set(serviceId: string, payer: string, session: SubchannelSession): Promise<void> {
    await writeJsonAtomic(this.filePath(serviceId, payer), session);
  }

  async delete(serviceId: string, payer: string): Promise<void> {
    try {
      await unlink(this.filePath(serviceId, payer));
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
      if (code === "ENOENT") return;
      throw err;
    }
  }

  async list(serviceId: string): Promise<SubchannelSession[]> {
    const sid = serviceId.toLowerCase();
    const dir = join(this.root, "server", sid);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
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
}
