import type WebSocket from "ws";
import type { RawData, WebSocketServer } from "ws";

import {
  WS_INTERNAL_ERROR_CODE,
  WS_INVALID_REQUEST_CODE,
  WS_METHOD_NOT_FOUND_CODE,
  type WSHandlerContext,
  type WSRequestId,
  type WSResponseMessage,
  type WSRouteHandler,
} from "../types";
import {
  createErrorResponse,
  isWSRequestMessage,
  isWSResponseMessage,
  parseWSMessage,
  stringifyWSMessage,
} from "../utils";

/**
 * Framework-agnostic x402 WebSocket request dispatcher.
 *
 * This class routes incoming JSON messages to registered method handlers,
 * while preserving request/response correlation through `id`.
 */
export class x402WSServer {
  private readonly handlers = new Map<string, WSRouteHandler>();
  private started = false;

  /**
   * Creates a new x402WSServer instance.
   *
   * @param wsServer - The underlying `ws` server instance
   */
  constructor(private readonly wsServer: WebSocketServer) {}

  /**
   * Gets the underlying `ws` server instance.
   *
   * @returns Underlying `ws` server
   */
  get server(): WebSocketServer {
    return this.wsServer;
  }

  /**
   * Registers a method handler.
   *
   * @param method - Method name expected in incoming request envelopes
   * @param handler - Handler to execute for the method
   * @returns This instance for chaining
   */
  registerHandler(method: string, handler: WSRouteHandler): this {
    this.handlers.set(method, handler);
    return this;
  }

  /**
   * Removes a method handler.
   *
   * @param method - Method name to remove
   * @returns This instance for chaining
   */
  unregisterHandler(method: string): this {
    this.handlers.delete(method);
    return this;
  }

  /**
   * Checks whether a handler is registered for a method.
   *
   * @param method - Method name
   * @returns True when a handler exists
   */
  hasHandler(method: string): boolean {
    return this.handlers.has(method);
  }

  /**
   * Lists all registered method names.
   *
   * @returns Method names
   */
  listMethods(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Starts listening for WebSocket connections and messages.
   *
   * @returns This instance for chaining
   */
  start(): this {
    if (this.started) {
      return this;
    }

    this.wsServer.on("connection", this.handleConnection);
    this.started = true;
    return this;
  }

  /**
   * Stops handling new connections.
   *
   * Note: this does not close the underlying server; it only detaches
   * the x402 dispatcher listener.
   *
   * @returns This instance for chaining
   */
  stop(): this {
    if (!this.started) {
      return this;
    }

    this.wsServer.off("connection", this.handleConnection);
    this.started = false;
    return this;
  }

  /**
   * Connection event handler for new sockets.
   *
   * @param socket - Connected client socket
   */
  private readonly handleConnection = (socket: WebSocket): void => {
    socket.on("message", (data: RawData) => {
      void this.handleMessage(socket, data);
    });
  };

  /**
   * Handles a single incoming message.
   *
   * @param socket - Source socket
   * @param data - Raw message payload
   */
  private async handleMessage(socket: WebSocket, data: unknown): Promise<void> {
    let parsedMessage: unknown;
    try {
      parsedMessage = parseWSMessage(data);
    } catch {
      this.safeSend(
        socket,
        createErrorResponse(undefined, WS_INVALID_REQUEST_CODE, "Invalid JSON message"),
      );
      return;
    }

    if (!isWSRequestMessage(parsedMessage)) {
      this.safeSend(
        socket,
        createErrorResponse(undefined, WS_INVALID_REQUEST_CODE, "Invalid request envelope"),
      );
      return;
    }

    const request = parsedMessage;
    const handler = this.handlers.get(request.method);
    if (!handler) {
      this.safeSend(
        socket,
        createErrorResponse(
          request.id,
          WS_METHOD_NOT_FOUND_CODE,
          `No handler registered for method: ${request.method}`,
        ),
      );
      return;
    }

    const context: WSHandlerContext = {
      socket,
      server: this.wsServer,
      request,
    };

    try {
      const handlerResult = await handler(request, context);
      const response = this.normalizeResponse(request.id, handlerResult);
      this.safeSend(socket, response);
    } catch (error) {
      this.safeSend(
        socket,
        createErrorResponse(
          request.id,
          WS_INTERNAL_ERROR_CODE,
          error instanceof Error ? error.message : "Internal server error",
        ),
      );
    }
  }

  /**
   * Normalizes handler output into a WS response envelope.
   *
   * @param requestId - Request ID from incoming message
   * @param handlerResult - Raw handler return value
   * @returns Normalized response envelope
   */
  private normalizeResponse(
    requestId: WSRequestId | undefined,
    handlerResult: WSResponseMessage | unknown,
  ): WSResponseMessage {
    if (isWSResponseMessage(handlerResult)) {
      if (handlerResult.id !== undefined) {
        return handlerResult;
      }

      return {
        ...handlerResult,
        id: requestId,
      };
    }

    return {
      id: requestId,
      result: handlerResult,
    };
  }

  /**
   * Sends a response envelope over the socket.
   *
   * @param socket - Destination socket
   * @param response - Response envelope
   */
  private safeSend(socket: WebSocket, response: WSResponseMessage): void {
    try {
      socket.send(stringifyWSMessage(response));
    } catch {
      // Ignore socket send failures to avoid crashing server dispatch loop.
    }
  }
}

export default x402WSServer;
