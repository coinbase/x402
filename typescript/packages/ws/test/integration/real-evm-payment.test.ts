import type { AddressInfo } from "node:net";

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
import { toFacilitatorEvmSigner } from "@x402/evm";
import { ExactEvmScheme as ExactEvmClient } from "@x402/evm/exact/client";
import { ExactEvmScheme as ExactEvmFacilitator } from "@x402/evm/exact/facilitator";
import { ExactEvmScheme as ExactEvmServer } from "@x402/evm/exact/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import type { RawData } from "ws";

import { createWSPaymentWrapper, x402WSClient, x402WSServer } from "../../src";

const NETWORK = "eip155:84532" as const;
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA_EXPLORER_TX_BASE_URL = "https://sepolia.basescan.org/tx";

const CLIENT_PRIVATE_KEY_ENV = "CLIENT_PRIVATE_KEY";
const FACILITATOR_PRIVATE_KEY_ENV = "FACILITATOR_PRIVATE_KEY";
const SHARED_PRIVATE_KEY_ENV = "X402_TEST_PRIVATE_KEY";
const BASE_SEPOLIA_RPC_URL_ENV = "BASE_SEPOLIA_RPC_URL";
const WS_DEBUG_ENV = "WS_DEBUG";

const hasRequiredEnv = Boolean(
  process.env[SHARED_PRIVATE_KEY_ENV] ||
    (process.env[CLIENT_PRIVATE_KEY_ENV] && process.env[FACILITATOR_PRIVATE_KEY_ENV]),
);
const describeIfConfigured = hasRequiredEnv ? describe : describe.skip;
const wsDebugEnabled = ["1", "true", "yes"].includes(
  (process.env[WS_DEBUG_ENV] || "").toLowerCase(),
);

class EvmFacilitatorClient implements FacilitatorClient {
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
  if (network === "eip155:84532") {
    return `${BASE_SEPOLIA_EXPLORER_TX_BASE_URL}/${transaction}`;
  }

  return null;
}

function resolvePrivateKey(roleEnvName: string): `0x${string}` {
  const roleKey = process.env[roleEnvName];
  const sharedKey = process.env[SHARED_PRIVATE_KEY_ENV];
  const privateKey = roleKey || sharedKey;

  if (!privateKey) {
    throw new Error(
      `${roleEnvName} or ${SHARED_PRIVATE_KEY_ENV} must be set to run real WebSocket integration tests`,
    );
  }

  return privateKey as `0x${string}`;
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

function buildPaymentRequirements(payTo: `0x${string}`): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    asset: BASE_SEPOLIA_USDC,
    amount: "1000",
    payTo,
    maxTimeoutSeconds: 3600,
    extra: {
      name: "USDC",
      version: "2",
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

describeIfConfigured("@x402/ws real EVM settlement integration", () => {
  let wsNativeServer: WebSocketServer;
  let wsDispatcher: x402WSServer;
  let wsSocket: WebSocket;
  let wsClient: x402WSClient;

  beforeAll(async () => {
    const clientAccount = privateKeyToAccount(resolvePrivateKey(CLIENT_PRIVATE_KEY_ENV));
    const facilitatorAccount = privateKeyToAccount(resolvePrivateKey(FACILITATOR_PRIVATE_KEY_ENV));

    const paymentClient = new x402Client().register(NETWORK, new ExactEvmClient(clientAccount));

    const rpcUrl = process.env[BASE_SEPOLIA_RPC_URL_ENV];
    const transport = http(rpcUrl);

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport,
    });

    const walletClient = createWalletClient({
      account: facilitatorAccount,
      chain: baseSepolia,
      transport,
    });

    const facilitatorSigner = toFacilitatorEvmSigner({
      address: facilitatorAccount.address,
      readContract: args =>
        publicClient.readContract({
          ...args,
          args: args.args || [],
        } as never),
      verifyTypedData: args => publicClient.verifyTypedData(args as never),
      writeContract: args =>
        walletClient.writeContract({
          ...args,
          args: args.args || [],
        } as never),
      sendTransaction: args => walletClient.sendTransaction(args),
      waitForTransactionReceipt: args => publicClient.waitForTransactionReceipt(args),
      getCode: args => publicClient.getCode(args),
    });

    const facilitator = new x402Facilitator().register(
      NETWORK,
      new ExactEvmFacilitator(facilitatorSigner),
    );

    const resourceServer = new x402ResourceServer(new EvmFacilitatorClient(facilitator));
    resourceServer.register(NETWORK, new ExactEvmServer());
    await resourceServer.initialize();

    const paidEcho = createWSPaymentWrapper(resourceServer, {
      accepts: [buildPaymentRequirements(facilitatorAccount.address)],
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

  it("settles payment over WebSocket and returns on-chain transaction hash", async () => {
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
    expect(response.paymentResponse?.transaction).toMatch(/^0x[a-fA-F0-9]+$/);

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
