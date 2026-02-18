import { x402Client } from "@x402/core/client";
import type { x402ClientConfig } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";

import type {
  WSAfterPaymentHook,
  WSBeforePaymentHook,
  WSClientSocket,
  WSRequestId,
  WSRequestMessage,
  WSRequestOptions,
  WSResponseMessage,
  WSError,
  WSPaymentRequiredError,
  WSPaymentRequiredHook,
  WSPaymentRequestedContext,
  x402WSCallResult,
  x402WSClientConfig,
  x402WSClientOptions,
} from "../types";
import {
  extractPaymentRequiredFromResponse,
  extractPaymentResponseFromResponse,
  isWSResponseMessage,
  parseWSMessage,
} from "../utils";

const WS_READY_STATE_CONNECTING = 0;
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const WS_READY_STATE_CLOSED = 3;

const DEFAULT_OPEN_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

type TimeoutHandle = unknown;

type PendingRequest = {
  timeout: TimeoutHandle;
  resolve: (response: WSResponseMessage) => void;
  reject: (error: Error) => void;
};

type GlobalTimer = {
  setTimeout?: (callback: () => void, timeoutMs?: number) => TimeoutHandle;
  clearTimeout?: (timeoutId: TimeoutHandle) => void;
};

const normalizeUnknownError = (error: unknown, fallbackMessage: string): Error => {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
};

const scheduleTimeout = (callback: () => void, timeoutMs: number): TimeoutHandle => {
  const timer = globalThis as unknown as GlobalTimer;

  if (!timer.setTimeout) {
    throw new Error("setTimeout is not available in this runtime");
  }

  return timer.setTimeout(callback, timeoutMs);
};

const cancelTimeout = (timeoutId: TimeoutHandle): void => {
  const timer = globalThis as unknown as GlobalTimer;
  timer.clearTimeout?.(timeoutId);
};

const describeReadyState = (readyState: number): string => {
  switch (readyState) {
    case WS_READY_STATE_CONNECTING:
      return "CONNECTING";
    case WS_READY_STATE_OPEN:
      return "OPEN";
    case WS_READY_STATE_CLOSING:
      return "CLOSING";
    case WS_READY_STATE_CLOSED:
      return "CLOSED";
    default:
      return `UNKNOWN (${readyState})`;
  }
};

/**
 * x402-enabled WebSocket client for request/response style RPC messaging.
 *
 * The client wraps a WebSocket-like socket to automatically handle x402
 * payment-required responses (code 402), create payment payloads through
 * `x402Client`, and retry calls with payment attached.
 */
export class x402WSClient {
  private readonly _socket: WSClientSocket;
  private readonly _paymentClient: x402Client;
  private readonly options: Required<x402WSClientOptions>;

  private readonly pendingRequests = new Map<WSRequestId, PendingRequest>();
  private readonly paymentRequiredHooks: WSPaymentRequiredHook[] = [];
  private readonly beforePaymentHooks: WSBeforePaymentHook[] = [];
  private readonly afterPaymentHooks: WSAfterPaymentHook[] = [];

  private nextRequestId = 1;

  /**
   * Creates a new x402WSClient instance.
   *
   * @param socket - The underlying WebSocket-like client socket
   * @param paymentClient - x402 payment client used to create payment payloads
   * @param options - Optional payment behavior configuration
   */
  constructor(
    socket: WSClientSocket,
    paymentClient: x402Client,
    options: x402WSClientOptions = {},
  ) {
    this._socket = socket;
    this._paymentClient = paymentClient;
    this.options = {
      autoPayment: options.autoPayment ?? true,
      onPaymentRequested: options.onPaymentRequested ?? (() => true),
    };

    this._socket.on("message", this.handleSocketMessage);
    this._socket.on("close", this.handleSocketClose);
    this._socket.on("error", this.handleSocketError);
  }

  /**
   * Returns the underlying socket instance.
   *
   * @returns Underlying WebSocket-like client socket
   */
  get socket(): WSClientSocket {
    return this._socket;
  }

  /**
   * Returns the underlying x402 payment client.
   *
   * @returns Underlying x402 payment client
   */
  get paymentClient(): x402Client {
    return this._paymentClient;
  }

  /**
   * Registers a hook invoked when a payment-required response is received.
   *
   * Hooks run in order and the first hook to return a result wins.
   *
   * @param hook - Hook function
   * @returns This instance for chaining
   */
  onPaymentRequired(hook: WSPaymentRequiredHook): this {
    this.paymentRequiredHooks.push(hook);
    return this;
  }

  /**
   * Registers a hook that runs before auto-generated payment is submitted.
   *
   * @param hook - Hook function
   * @returns This instance for chaining
   */
  onBeforePayment(hook: WSBeforePaymentHook): this {
    this.beforePaymentHooks.push(hook);
    return this;
  }

  /**
   * Registers a hook that runs after payment submission response is received.
   *
   * @param hook - Hook function
   * @returns This instance for chaining
   */
  onAfterPayment(hook: WSAfterPaymentHook): this {
    this.afterPaymentHooks.push(hook);
    return this;
  }

  /**
   * Waits until the underlying socket is open.
   *
   * @param timeoutMs - Maximum time to wait before rejecting
   */
  async waitForOpen(timeoutMs: number = DEFAULT_OPEN_TIMEOUT_MS): Promise<void> {
    if (this._socket.readyState === WS_READY_STATE_OPEN) {
      return;
    }

    if (this._socket.readyState !== WS_READY_STATE_CONNECTING) {
      throw new Error(
        `WebSocket is not connecting. Current state: ${describeReadyState(this._socket.readyState)}`,
      );
    }

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const timeout = scheduleTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for WebSocket to open after ${timeoutMs}ms`));
      }, timeoutMs);

      const cleanup = () => {
        cancelTimeout(timeout);
        this._socket.off("open", onOpen);
        this._socket.off("error", onError);
      };

      this._socket.once("open", onOpen);
      this._socket.on("error", onError);
    });
  }

  /**
   * Calls a server method and automatically handles payment-required responses.
   *
   * @param method - Method name to invoke
   * @param params - Method parameters
   * @param requestOptions - Optional request-level options
   * @returns Method result with payment metadata
   */
  async call<TResult = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    requestOptions?: WSRequestOptions,
  ): Promise<x402WSCallResult<TResult>> {
    const firstResponse = await this.sendRequest({ method, params }, requestOptions);
    const paymentRequired = extractPaymentRequiredFromResponse(firstResponse);

    if (!paymentRequired) {
      return this.createCallResult<TResult>(firstResponse, false);
    }

    const paymentContext: WSPaymentRequestedContext = {
      method,
      params,
      paymentRequired,
    };

    for (const hook of this.paymentRequiredHooks) {
      const hookResult = await hook(paymentContext);
      if (!hookResult) {
        continue;
      }

      if (hookResult.abort) {
        throw new Error("Payment aborted by hook");
      }

      if (hookResult.payment) {
        return this.callWithPayment(method, params, hookResult.payment, requestOptions);
      }
    }

    if (!this.options.autoPayment) {
      throw this.createResponseError(firstResponse.error!);
    }

    const approved = await this.options.onPaymentRequested(paymentContext);
    if (!approved) {
      throw new Error("Payment request denied");
    }

    for (const hook of this.beforePaymentHooks) {
      await hook(paymentContext);
    }

    const paymentPayload = await this._paymentClient.createPaymentPayload(paymentRequired);
    return this.callWithPayment(method, params, paymentPayload, requestOptions);
  }

  /**
   * Calls a server method with an explicit payment payload.
   *
   * @param method - Method name to invoke
   * @param params - Method parameters
   * @param paymentPayload - Payment payload to attach to request
   * @param requestOptions - Optional request-level options
   * @returns Method result with settlement metadata
   */
  async callWithPayment<TResult = unknown>(
    method: string,
    params: Record<string, unknown>,
    paymentPayload: PaymentPayload,
    requestOptions?: WSRequestOptions,
  ): Promise<x402WSCallResult<TResult>> {
    const response = await this.sendRequest(
      {
        method,
        params,
        payment: paymentPayload,
      },
      requestOptions,
    );

    const settleResponse = extractPaymentResponseFromResponse(response);

    for (const hook of this.afterPaymentHooks) {
      await hook({
        method,
        params,
        paymentPayload,
        response,
        settleResponse,
      });
    }

    if (response.error) {
      throw this.createResponseError(response.error);
    }

    const result: x402WSCallResult<TResult> = {
      result: response.result as TResult,
      paymentMade: true,
    };

    if (settleResponse) {
      result.paymentResponse = settleResponse;
    }

    return result;
  }

  /**
   * Sends a request over the socket and awaits the correlated response.
   *
   * @param request - Outbound request envelope without an ID
   * @param requestOptions - Optional timeout configuration
   * @returns Parsed response envelope
   */
  private async sendRequest(
    request: Omit<WSRequestMessage, "id">,
    requestOptions?: WSRequestOptions,
  ): Promise<WSResponseMessage> {
    const timeoutMs = requestOptions?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    await this.ensureSocketOpen(timeoutMs);

    const requestId = this.nextRequestId++;
    const requestWithId: WSRequestMessage = {
      ...request,
      id: requestId,
    };

    return new Promise<WSResponseMessage>((resolve, reject) => {
      const timeout = scheduleTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Timed out waiting for response to method: ${request.method}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        timeout,
        resolve,
        reject,
      });

      try {
        this._socket.send(JSON.stringify(requestWithId));
      } catch (error) {
        cancelTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(
          normalizeUnknownError(error, `Failed to send request for method: ${request.method}`),
        );
      }
    });
  }

  /**
   * Ensures socket is open (or waits for open) before sending requests.
   *
   * @param timeoutMs - Timeout used when waiting for open state
   */
  private async ensureSocketOpen(timeoutMs: number): Promise<void> {
    if (this._socket.readyState === WS_READY_STATE_OPEN) {
      return;
    }

    if (this._socket.readyState === WS_READY_STATE_CONNECTING) {
      await this.waitForOpen(timeoutMs);
      return;
    }

    throw new Error(
      `WebSocket is not open. Current state: ${describeReadyState(this._socket.readyState)}`,
    );
  }

  /**
   * Converts a WS response into the public call result shape.
   *
   * @param response - Parsed response envelope
   * @param paymentMade - Whether payment was submitted for this call
   * @returns Normalized call result
   */
  private createCallResult<TResult>(
    response: WSResponseMessage,
    paymentMade: boolean,
  ): x402WSCallResult<TResult> {
    if (response.error) {
      throw this.createResponseError(response.error);
    }

    const settleResponse = extractPaymentResponseFromResponse(response);
    const result: x402WSCallResult<TResult> = {
      result: response.result as TResult,
      paymentMade,
    };

    if (settleResponse) {
      result.paymentResponse = settleResponse;
    }

    return result;
  }

  /**
   * Builds a standard Error from WS error payloads.
   *
   * @param responseError - Error object received from the server
   * @returns Enriched Error instance with response metadata
   */
  private createResponseError(responseError: WSError | WSPaymentRequiredError): Error & {
    code: number;
    data?: unknown;
    paymentRequired?: PaymentRequired;
  } {
    const error = new Error(responseError.message) as Error & {
      code: number;
      data?: unknown;
      paymentRequired?: PaymentRequired;
    };

    error.code = responseError.code;

    if (responseError.data !== undefined) {
      error.data = responseError.data;
    }

    if ("paymentRequired" in responseError) {
      error.paymentRequired = responseError.paymentRequired;
    }

    return error;
  }

  /**
   * Rejects all in-flight requests with the provided error.
   *
   * @param error - Error propagated to all pending promises
   */
  private rejectAllPending(error: Error): void {
    const pending = Array.from(this.pendingRequests.values());
    this.pendingRequests.clear();

    for (const request of pending) {
      cancelTimeout(request.timeout);
      request.reject(error);
    }
  }

  private readonly handleSocketMessage = (data: unknown): void => {
    let parsed: unknown;

    try {
      parsed = parseWSMessage(data);
    } catch {
      return;
    }

    if (!isWSResponseMessage(parsed) || parsed.id === undefined) {
      return;
    }

    const pendingRequest = this.pendingRequests.get(parsed.id);
    if (!pendingRequest) {
      return;
    }

    cancelTimeout(pendingRequest.timeout);
    this.pendingRequests.delete(parsed.id);
    pendingRequest.resolve(parsed);
  };

  private readonly handleSocketClose = (code: number, reason: unknown): void => {
    const reasonText = typeof reason === "string" && reason.length > 0 ? ` (${reason})` : "";
    this.rejectAllPending(new Error(`WebSocket closed with code ${code}${reasonText}`));
  };

  private readonly handleSocketError = (error: Error): void => {
    this.rejectAllPending(error);
  };
}

/**
 * Wraps an existing socket and x402Client with WS payment handling.
 *
 * @param socket - WebSocket-like socket instance
 * @param paymentClient - Preconfigured x402 client
 * @param options - Optional WS payment behavior options
 * @returns x402WSClient instance
 */
export function wrapWSClientWithPayment(
  socket: WSClientSocket,
  paymentClient: x402Client,
  options?: x402WSClientOptions,
): x402WSClient {
  return new x402WSClient(socket, paymentClient, options);
}

/**
 * Wraps an existing socket with WS payment handling from x402Client config.
 *
 * @param socket - WebSocket-like socket instance
 * @param config - x402 client scheme configuration
 * @param options - Optional WS payment behavior options
 * @returns x402WSClient instance
 */
export function wrapWSClientWithPaymentFromConfig(
  socket: WSClientSocket,
  config: x402ClientConfig,
  options?: x402WSClientOptions,
): x402WSClient {
  const paymentClient = x402Client.fromConfig(config);
  return new x402WSClient(socket, paymentClient, options);
}

/**
 * Creates a fully configured x402WSClient from WS-specific config.
 *
 * @param socket - WebSocket-like socket instance
 * @param config - WS client configuration including scheme registrations
 * @returns Configured x402WSClient instance
 */
export function createx402WSClient(
  socket: WSClientSocket,
  config: x402WSClientConfig,
): x402WSClient {
  const paymentClient = new x402Client();

  for (const scheme of config.schemes) {
    if (scheme.x402Version === 1) {
      paymentClient.registerV1(scheme.network, scheme.client);
    } else {
      paymentClient.register(scheme.network, scheme.client);
    }
  }

  return new x402WSClient(socket, paymentClient, {
    autoPayment: config.autoPayment,
    onPaymentRequested: config.onPaymentRequested,
  });
}
