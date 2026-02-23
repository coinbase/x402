/**
 * Server-Sent Events (SSE) handler for real-time workflow updates.
 *
 * Broadcasts workflow events to all connected clients.
 */

import type { Request, Response } from "express";
import type { EventStorage, WorkflowEvent } from "@x402-observed/core";
import { randomUUID } from "crypto";

/**
 * SSE client connection
 */
interface SSEClient {
  id: string;
  res: Response;
}

/**
 * Manages SSE client connections and broadcasts events
 */
class SSEManager {
  private clients: Set<SSEClient> = new Set();

  /**
   * Add a new SSE client
   */
  addClient(client: SSEClient): void {
    this.clients.add(client);
  }

  /**
   * Remove a disconnected client
   */
  removeClient(clientId: string): void {
    for (const client of this.clients) {
      if (client.id === clientId) {
        this.clients.delete(client);
        break;
      }
    }
  }

  /**
   * Broadcast an event to all connected clients
   */
  broadcast(event: WorkflowEvent): void {
    const data = JSON.stringify(event);
    const message = `data: ${data}\n\n`;

    // Send to all clients
    for (const client of this.clients) {
      try {
        client.res.write(message);
      } catch (error) {
        // Client disconnected, will be cleaned up on 'close' event
        console.error("Error broadcasting to client:", error);
      }
    }
  }

  /**
   * Get the number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

/**
 * Create an SSE handler for the given storage instance
 */
export function createSSEHandler(storage: EventStorage) {
  const manager = new SSEManager();

  // Register callback to broadcast new events
  storage.onEvent((event) => {
    manager.broadcast(event);
  });

  // Return Express route handler
  return (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Disable buffering for SSE
    res.flushHeaders();

    // Create client
    const clientId = randomUUID();
    const client: SSEClient = { id: clientId, res };

    manager.addClient(client);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

    // Clean up on disconnect
    req.on("close", () => {
      manager.removeClient(clientId);
    });
  };
}
