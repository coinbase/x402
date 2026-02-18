import type { AddressInfo } from "node:net";

import { base58 } from "@scure/base";
import { x402Client } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import { x402ResourceServer } from "@x402/core/server";
import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { toFacilitatorSvmSigner } from "@x402/svm";
import { ExactSvmScheme as ExactSvmClient } from "@x402/svm/exact/client";
import { ExactSvmScheme as ExactSvmFacilitator } from "@x402/svm/exact/facilitator";
import { ExactSvmScheme as ExactSvmServer } from "@x402/svm/exact/server";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import type { RawData } from "ws";

import { createWSPaymentWrapper, x402WSClient, x402WSServer } from "../../src";

const NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const;
const SOLANA_DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const SOLANA_DEVNET_EXPLORER_TX_BASE_URL = "https://solscan.io/tx";

const CLIENT_PRIVATE_KEY_ENV = "SVM_CLIENT_PRIVATE_KEY";
const FACILITATOR_PRIVATE_KEY_ENV = "SVM_FACILITATOR_PRIVATE_KEY";
const RESOURCE_SERVER_ADDRESS_ENV = "SVM_RESOURCE_SERVER_ADDRESS";
const SOLANA_DEVNET_RPC_URL_ENV = "SOLANA_DEVNET_RPC_URL";
const WS_DEBUG_ENV = "WS_DEBUG";

const hasRequiredEnv = Boolean(
  process.env[CLIENT_PRIVATE_KEY_ENV] &&
    process.env[FACILITATOR_PRIVATE_KEY_ENV] &&
    process.env[RESOURCE_SERVER_ADDRESS_ENV],
);
const describeIfConfigured = hasRequiredEnv ? describe : describe.skip;
const wsDebugEnabled = ["1", "true", "yes"].includes(
  (process.env[WS_DEBUG_ENV] || "").toLowerCase(),
);

class SvmFacilitatorClient implements FacilitatorClient {
  readonly scheme = "exact";
  readonly network = NETWORK;
  readonly x402Version = 2;

  constructor(private readonly facilitator: x402Facilitator) {}

  verify(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }

  settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    return this.facilitator.settle(paymentPayload, paymentRequirements);
  }

  getSupported(): Promise<SupportedResponse> {
    return Promise.resolve(this.facilitator.getSupported() as SupportedResponse);
  }
}

function getExplorerTxUrl(network: string, transaction: string): string | null {
  if (network === NETWORK) {
    return `${SOLANA_DEVNET_EXPLORER_TX_BASE_URL}/${transaction}?cluster=devnet`;
  }

  return null;
}

function resolveRequiredEnv(envName: string): string {
  const value = process.env[envName];
  if (!value) {
    throw new Error(`${envName} must be set to run real WebSocket integration tests`);
  }

  return value;
}

function resolveBase58PrivateKey(roleEnvName: string): Uint8Array {
  const privateKey = resolveRequiredEnv(roleEnvName);

  try {
    return base58.decode(privateKey);
  } catch {
    throw new Error(`${roleEnvName} must be a valid base58-encoded private key`);
  }
}

function rawDataToString(data: RawData): string {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf-8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf-8");
  }

  if (Array.isArray(data)) {
    return data.map(chunk => rawDataToString(chunk)).join("");
  }

  return String(data);
}

function logWS(label: string, data: RawData): void {
  if (!wsDebugEnabled) {
    return;
  }

  const serialized = rawDataToString(data);

  try {
    const parsed = JSON.parse(serialized) as unknown;
    console.log(`[ws-debug] ${label}`, parsed);
  } catch {
    console.log(`[ws-debug] ${label}`, serialized);
  }
}

function buildPaymentRequirements(payTo: string, feePayer: string): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    asset: SOLANA_DEVNET_USDC,
    amount: "1000",
    payTo,
    maxTimeoutSeconds: 3600,
    extra: {
      feePayer,
    },
  };
}

async function waitForListening(server: WebSocketServer): Promise<number> {
  const currentAddress = server.address();
  if (currentAddress && typeof currentAddress !== "string") {
    return currentAddress.port;
  }

  return new Promise<number>((resolve, reject) => {
    const onListening = () => {
      cleanup();

      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("WebSocket server did not provide an address"));
        return;
      }

      resolve((address as AddressInfo).port);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      server.off("listening", onListening);
      server.off("error", onError);
    };

    server.on("listening", onListening);
    server.on("error", onError);
  });
}

async function closeSocket(socket: WebSocket | undefined): Promise<void> {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    return;
  }

  await new Promise<void>(resolve => {
    const onClose = () => {
      socket.off("close", onClose);
      resolve();
    };

    socket.on("close", onClose);

    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close();
      return;
    }

    resolve();
  });
}

describeIfConfigured("@x402/ws real SVM settlement integration", () => {
  let wsNativeServer: WebSocketServer;
  let wsDispatcher: x402WSServer;
  let wsSocket: WebSocket;
  let wsClient: x402WSClient;
  let clientAddress: string;

  beforeAll(async () => {
    const clientSigner = await createKeyPairSignerFromBytes(
      resolveBase58PrivateKey(CLIENT_PRIVATE_KEY_ENV),
    );
    const facilitatorSignerKeyPair = await createKeyPairSignerFromBytes(
      resolveBase58PrivateKey(FACILITATOR_PRIVATE_KEY_ENV),
    );

    const facilitatorAddress = facilitatorSignerKeyPair.address;
    const resourceServerAddress = resolveRequiredEnv(RESOURCE_SERVER_ADDRESS_ENV);
    const rpcUrl = process.env[SOLANA_DEVNET_RPC_URL_ENV];

    clientAddress = clientSigner.address;

    const paymentClient = new x402Client().register(
      NETWORK,
      new ExactSvmClient(clientSigner, rpcUrl ? { rpcUrl } : undefined),
    );

    const facilitatorSigner = toFacilitatorSvmSigner(
      facilitatorSignerKeyPair,
      rpcUrl ? { defaultRpcUrl: rpcUrl } : undefined,
    );

    const facilitator = new x402Facilitator().register(
      NETWORK,
      new ExactSvmFacilitator(facilitatorSigner),
    );

    const resourceServer = new x402ResourceServer(new SvmFacilitatorClient(facilitator));
    resourceServer.register(NETWORK, new ExactSvmServer());
    await resourceServer.initialize();

    const paidEcho = createWSPaymentWrapper(resourceServer, {
      accepts: [buildPaymentRequirements(resourceServerAddress, facilitatorAddress)],
      resource: {
        url: "ws://localhost/paid_echo",
        description: "Paid echo",
        mimeType: "application/json",
      },
    });

    wsNativeServer = new WebSocketServer({
      host: "127.0.0.1",
      port: 0,
    });

    wsNativeServer.on("connection", socket => {
      socket.on("message", (data: RawData) => {
        logWS("server <= client", data);
      });
    });

    wsDispatcher = new x402WSServer(wsNativeServer)
      .registerHandler(
        "paid_echo",
        paidEcho(async params => {
          return {
            echoed: params,
          };
        }),
      )
      .start();

    const port = await waitForListening(wsNativeServer);
    wsSocket = new WebSocket(`ws://127.0.0.1:${port}`);

    wsSocket.on("message", (data: RawData) => {
      logWS("client <= server", data);
    });

    wsClient = new x402WSClient(wsSocket, paymentClient, {
      autoPayment: true,
    });

    await wsClient.waitForOpen(15_000);
  }, 120_000);

  afterAll(async () => {
    await closeSocket(wsSocket);

    if (wsDispatcher) {
      wsDispatcher.stop();
    }

    if (wsNativeServer) {
      await new Promise<void>((resolve, reject) => {
        wsNativeServer.close(error => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it("settles payment over WebSocket and returns Solana transaction signature", async () => {
    const message = "hello real paid websocket";

    const response = await wsClient.call<{ echoed: { message: string } }>(
      "paid_echo",
      { message },
      { timeoutMs: 180_000 },
    );

    expect(response.result).toEqual({
      echoed: { message },
    });
    expect(response.paymentMade).toBe(true);
    expect(response.paymentResponse).toBeDefined();
    expect(response.paymentResponse?.success).toBe(true);
    expect(response.paymentResponse?.network).toBe(NETWORK);
    expect(response.paymentResponse?.payer).toBe(clientAddress);
    expect(response.paymentResponse?.transaction).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);

    const settlement = response.paymentResponse;
    if (settlement?.transaction) {
      const explorerTxUrl = getExplorerTxUrl(settlement.network, settlement.transaction);
      if (explorerTxUrl) {
        console.log(`[ws-tx] ${settlement.transaction}`);
        console.log(`[ws-explorer] ${explorerTxUrl}`);
      } else {
        console.log(`[ws-tx] ${settlement.transaction}`);
      }
    }
  }, 240_000);
});
