export interface SubchannelSession {
  serviceId: string;
  payer: string;
  chargedCumulativeAmount: string;
  signedCumulativeAmount: string;
  lastNonce: number;
  signature: string;
  deposit: string;
  totalClaimed: string;
  withdrawRequestedAt: number;
  lastRequestTimestamp: number;
}

export interface SessionStorage {
  get(serviceId: string, payer: string): Promise<SubchannelSession | undefined>;
  set(serviceId: string, payer: string, session: SubchannelSession): Promise<void>;
  delete(serviceId: string, payer: string): Promise<void>;
  list(serviceId: string): Promise<SubchannelSession[]>;
}

/**
 * In-memory {@link SessionStorage} backed by a Map keyed by `serviceId:payer`.
 */
export class InMemorySessionStorage implements SessionStorage {
  private sessions = new Map<string, SubchannelSession>();

  /**
   * Returns the session for a service and payer, if present.
   *
   * @param serviceId - The service identifier.
   * @param payer - The payer address.
   * @returns The session or undefined when not found.
   */
  async get(serviceId: string, payer: string): Promise<SubchannelSession | undefined> {
    return this.sessions.get(this.key(serviceId, payer));
  }

  /**
   * Stores or replaces the session for a service and payer.
   *
   * @param serviceId - The service identifier.
   * @param payer - The payer address.
   * @param session - The session record to persist.
   */
  async set(serviceId: string, payer: string, session: SubchannelSession): Promise<void> {
    this.sessions.set(this.key(serviceId, payer), session);
  }

  /**
   * Deletes the session for a service and payer.
   *
   * @param serviceId - The service identifier.
   * @param payer - The payer address.
   */
  async delete(serviceId: string, payer: string): Promise<void> {
    this.sessions.delete(this.key(serviceId, payer));
  }

  /**
   * Lists all sessions for a given service.
   *
   * @param serviceId - The service identifier.
   * @returns Sessions whose key starts with this service id.
   */
  async list(serviceId: string): Promise<SubchannelSession[]> {
    const prefix = `${serviceId}:`;
    const results: SubchannelSession[] = [];
    for (const [key, session] of this.sessions) {
      if (key.startsWith(prefix)) {
        results.push(session);
      }
    }
    return results;
  }

  /**
   * Builds the internal map key for a service and payer.
   *
   * @param serviceId - The service identifier.
   * @param payer - The payer address.
   * @returns Lowercased composite key string.
   */
  private key(serviceId: string, payer: string): string {
    return `${serviceId}:${payer.toLowerCase()}`;
  }
}
