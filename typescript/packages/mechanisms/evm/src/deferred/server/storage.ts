import type { ChannelConfig } from "../types";

export interface ChannelSession {
  channelId: string;
  channelConfig: ChannelConfig;
  payer: string;
  chargedCumulativeAmount: string;
  signedMaxClaimable: string;
  signature: string;
  balance: string;
  totalClaimed: string;
  withdrawRequestedAt: number;
  lastRequestTimestamp: number;
}

export interface SessionStorage {
  get(channelId: string): Promise<ChannelSession | undefined>;
  set(channelId: string, session: ChannelSession): Promise<void>;
  delete(channelId: string): Promise<void>;
  list(): Promise<ChannelSession[]>;
}

/**
 * In-memory {@link SessionStorage} backed by a Map keyed by `channelId`.
 */
export class InMemorySessionStorage implements SessionStorage {
  private sessions = new Map<string, ChannelSession>();

  /**
   * Returns the session for a channel, if present.
   *
   * @param channelId - The channel identifier.
   * @returns The session or undefined when not found.
   */
  async get(channelId: string): Promise<ChannelSession | undefined> {
    return this.sessions.get(channelId.toLowerCase());
  }

  /**
   * Stores or replaces the session for a channel.
   *
   * @param channelId - The channel identifier.
   * @param session - The session record to persist.
   */
  async set(channelId: string, session: ChannelSession): Promise<void> {
    this.sessions.set(channelId.toLowerCase(), session);
  }

  /**
   * Deletes the session for a channel.
   *
   * @param channelId - The channel identifier.
   */
  async delete(channelId: string): Promise<void> {
    this.sessions.delete(channelId.toLowerCase());
  }

  /**
   * Lists all stored sessions.
   *
   * @returns All sessions in storage.
   */
  async list(): Promise<ChannelSession[]> {
    return [...this.sessions.values()];
  }
}
