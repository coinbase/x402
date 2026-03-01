import { describe, expect, it, vi } from "vitest";

import { x402WSClient } from "../../src/client";
import type { WSClientSocket, WSRequestMessage, WSResponseMessage } from "../../src/types";
import type { x402Client } from "@x402/core/client";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";

type SendHandler = (request: WSRequestMessage, socket: MockSocket) => void;

/**
 *
 */
class MockSocket implements WSClientSocket {
  readyState = 1;

  private readonly listeners: {
    message: Set<(data: unknown) => void>;
    close: Set<(code: number, reason: unknown) => void>;
    error: Set<(error: Error) => void>;
    open: Set<() => void>;
  } = {
    message: new Set(),
    close: new Set(),
    error: new Set(),
    open: new Set(),
  };

  private readonly sendHandlers: SendHandler[] = [];
  readonly sentRequests: WSRequestMessage[] = [];

  /**
   *
   * @param handler
   */
  queueSendHandler(handler: SendHandler): void {
    this.sendHandlers.push(handler);
  }

  /**
   *
   * @param response
   */
  reply(response: WSResponseMessage): void {
    this.emitMessage(JSON.stringify(response));
  }

  /**
   *
   */
  emitOpen(): void {
    this.listeners.open.forEach(listener => listener());
  }

  /**
   *
   * @param data
   */
  emitMessage(data: unknown): void {
    this.listeners.message.forEach(listener => listener(data));
  }

  /**
   *
   * @param code
   * @param reason
   */
  emitClose(code: number, reason: unknown): void {
    this.readyState = 3;
    this.listeners.close.forEach(listener => listener(code, reason));
  }

  /**
   *
   * @param error
   */
  emitError(error: Error): void {
    this.listeners.error.forEach(listener => listener(error));
  }

  /**
   *
   * @param data
   */
  send(data: string): void {
    const request = JSON.parse(data) as WSRequestMessage;
    this.sentRequests.push(request);

    const handler = this.sendHandlers.shift();
    if (handler) {
      handler(request, this);
    }
  }

  /**
   *
   */
  on(event: "message", listener: (data: unknown) => void): this;
  /**
   *
   */
  on(event: "close", listener: (code: number, reason: unknown) => void): this;
  /**
   *
   */
  on(event: "error", listener: (error: Error) => void): this;
  /**
   *
   * @param event
   * @param listener
   */
  on(
    event: "message" | "close" | "error",
    listener:
      | ((data: unknown) => void)
      | ((code: number, reason: unknown) => void)
      | ((error: Error) => void),
  ): this {
    if (event === "message") {
      this.listeners.message.add(listener as (data: unknown) => void);
      return this;
    }

    if (event === "close") {
      this.listeners.close.add(listener as (code: number, reason: unknown) => void);
      return this;
    }

    this.listeners.error.add(listener as (error: Error) => void);
    return this;
  }

  /**
   *
   * @param event
   * @param listener
   */
  once(event: "open", listener: () => void): this {
    const wrapped = () => {
      this.listeners.open.delete(wrapped);
      listener();
    };

    this.listeners.open.add(wrapped);
    return this;
  }

  /**
   *
   */
  off(event: "open", listener: () => void): this;
  /**
   *
   */
  off(event: "error", listener: (error: Error) => void): this;
  /**
   *
   * @param event
   * @param listener
   */
  off(event: "open" | "error", listener: (() => void) | ((error: Error) => void)): this {
    if (event === "open") {
      this.listeners.open.delete(listener as () => void);
      return this;
    }

    this.listeners.error.delete(listener as (error: Error) => void);
    return this;
  }
}

const validPaymentRequirements: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  amount: "1000000",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: "0x1234567890123456789012345678901234567890",
  maxTimeoutSeconds: 300,
  extra: {},
};

const validPaymentRequired: PaymentRequired = {
  x402Version: 2,
  accepts: [validPaymentRequirements],
  resource: {
    url: "ws://localhost:4022/echo",
    description: "Echo method",
    mimeType: "application/json",
  },
};

const validPaymentPayload: PaymentPayload = {
  x402Version: 2,
  accepted: validPaymentRequirements,
  payload: {
    signature: "0xdeadbeef",
  },
  resource: validPaymentRequired.resource,
};

const validSettlementResponse: SettleResponse = {
  success: true,
  transaction: "0xtransaction",
  network: "eip155:84532",
};

describe("x402WSClient", () => {
  it("returns successful responses for free calls without payment", async () => {
    const socket = new MockSocket();
    const paymentClient = {
      createPaymentPayload: vi.fn(),
    } as unknown as x402Client;

    socket.queueSendHandler(request => {
      socket.reply({
        id: request.id,
        result: { message: "hello" },
      });
    });

    const client = new x402WSClient(socket, paymentClient);
    const result = await client.call<{ message: string }>("echo", { message: "hello" });

    expect(result).toEqual({
      result: { message: "hello" },
      paymentMade: false,
    });
    expect(paymentClient.createPaymentPayload).not.toHaveBeenCalled();
    expect(socket.sentRequests[0]).toMatchObject({
      method: "echo",
      params: { message: "hello" },
    });
  });

  it("auto-pays when receiving payment required response", async () => {
    const socket = new MockSocket();
    const paymentClient = {
      createPaymentPayload: vi.fn().mockResolvedValue(validPaymentPayload),
    } as unknown as x402Client;

    socket.queueSendHandler(request => {
      socket.reply({
        id: request.id,
        error: {
          code: 402,
          message: "Payment required",
          paymentRequired: validPaymentRequired,
        },
      });
    });

    socket.queueSendHandler(request => {
      expect(request.payment).toEqual(validPaymentPayload);
      socket.reply({
        id: request.id,
        result: { ok: true },
        paymentResponse: validSettlementResponse,
      });
    });

    const client = new x402WSClient(socket, paymentClient, { autoPayment: true });
    const result = await client.call<{ ok: boolean }>("paid_echo", { message: "hello" });

    expect(paymentClient.createPaymentPayload).toHaveBeenCalledWith(validPaymentRequired);
    expect(result).toEqual({
      result: { ok: true },
      paymentMade: true,
      paymentResponse: validSettlementResponse,
    });
    expect(socket.sentRequests).toHaveLength(2);
  });

  it("throws a structured error when auto-payment is disabled", async () => {
    const socket = new MockSocket();
    const paymentClient = {
      createPaymentPayload: vi.fn(),
    } as unknown as x402Client;

    socket.queueSendHandler(request => {
      socket.reply({
        id: request.id,
        error: {
          code: 402,
          message: "Payment required",
          paymentRequired: validPaymentRequired,
        },
      });
    });

    const client = new x402WSClient(socket, paymentClient, { autoPayment: false });

    await expect(client.call("paid_echo", { message: "hello" })).rejects.toMatchObject({
      code: 402,
      message: "Payment required",
      paymentRequired: validPaymentRequired,
    });

    expect(paymentClient.createPaymentPayload).not.toHaveBeenCalled();
  });

  it("supports explicit payment via callWithPayment and runs after-payment hooks", async () => {
    const socket = new MockSocket();
    const paymentClient = {
      createPaymentPayload: vi.fn(),
    } as unknown as x402Client;

    socket.queueSendHandler(request => {
      expect(request.payment).toEqual(validPaymentPayload);
      socket.reply({
        id: request.id,
        result: { ok: true },
        paymentResponse: validSettlementResponse,
      });
    });

    const client = new x402WSClient(socket, paymentClient);
    const afterPaymentHook = vi.fn();
    client.onAfterPayment(afterPaymentHook);

    const result = await client.callWithPayment<{ ok: boolean }>(
      "paid_echo",
      { message: "hello" },
      validPaymentPayload,
    );

    expect(result).toEqual({
      result: { ok: true },
      paymentMade: true,
      paymentResponse: validSettlementResponse,
    });
    expect(afterPaymentHook).toHaveBeenCalledWith({
      method: "paid_echo",
      params: { message: "hello" },
      paymentPayload: validPaymentPayload,
      response: {
        id: socket.sentRequests[0].id,
        result: { ok: true },
        paymentResponse: validSettlementResponse,
      },
      settleResponse: validSettlementResponse,
    });
  });
});
