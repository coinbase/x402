import { toClientEvmSigner } from "@x402/evm";
import { DeferredEvmScheme, FileClientSessionStorage } from "@x402/evm/deferred/client";
import { type PaymentRequired, x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { config } from "dotenv";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/api/generate";
const url = `${baseURL}${endpointPath}`;
const sessionDir = process.env.DEFERRED_SESSION_DIR;

/**
 * Deferred scheme client: session state (cumulative amount, nonce, deposit) lives inside
 * {@link DeferredEvmScheme}. After each successful paid response, call
 * {@link DeferredEvmScheme.processPaymentResponse} so the next request can build a voucher-only payload.
 *
 * Required environment variables:
 * - EVM_PRIVATE_KEY: The private key of the EVM signer
 *
 * Optional:
 * - DEFERRED_SESSION_DIR: If set, subchannel state is persisted under `{directory}/client/...`
 *   (Node-only); otherwise sessions are in-memory only.
 */
async function main(): Promise<void> {
  const account = privateKeyToAccount(evmPrivateKey);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  const signer = toClientEvmSigner(account, publicClient);

  const deferredScheme = new DeferredEvmScheme(signer, {
    maxDeposit: "1000000",
    depositMultiplier: 5,
    ...(sessionDir
      ? { storage: new FileClientSessionStorage({ directory: sessionDir }) }
      : {}),
  });

  const client = new x402Client();
  client.register("eip155:*", deferredScheme);

  client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
    const sid = selectedRequirements.extra?.serviceId as `0x${string}` | undefined;
    if (
      sid &&
      selectedRequirements.scheme === "deferred" &&
      !(await deferredScheme.hasSession(sid))
    ) {
      await deferredScheme.recoverSession(sid, selectedRequirements.network);
    }
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  console.log(`Base URL: ${baseURL}, endpoint: ${endpointPath}\n`);

  for (let i = 0; i < 3; i++) {
    const requestInit: RequestInit = { method: "GET" };
    let response = await fetchWithPayment(url, requestInit);
    const getHeader = (name: string) => response.headers.get(name);
    let correctivePaymentRequired: PaymentRequired | undefined;

    if (response.status === 402) {
      console.log("Corrective payment required");
      try {
        correctivePaymentRequired = httpClient.getPaymentRequiredResponse(getHeader);
        console.log(JSON.stringify(correctivePaymentRequired, null, 2));
        if (await deferredScheme.processCorrectivePaymentRequired(correctivePaymentRequired)) {
          response = await fetchWithPayment(url, requestInit);
        }
      } catch {
        // leave `response` as the corrective 402 (or invalid PAYMENT-REQUIRED)
      }
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body =
      response.status === 402 && correctivePaymentRequired !== undefined
        ? correctivePaymentRequired
        : contentType.includes("application/json")
          ? await response.json()
          : await response.text();
    console.log(
      `Request ${i + 1}:`,
      typeof body === "object" && body !== null ? JSON.stringify(body, null, 2) : body,
    );

    if (getHeader("PAYMENT-RESPONSE") || getHeader("X-PAYMENT-RESPONSE")) {
      const paymentResponse = httpClient.getPaymentSettleResponse(getHeader);
      console.log(`Request ${i + 1} payment response:\n${JSON.stringify(paymentResponse, null, 2)}\n`);
    } else {
      console.log(`Request ${i + 1}: no PAYMENT-RESPONSE (${response.status})\n`);
    }

    await deferredScheme.processPaymentResponse(getHeader);

    // await new Promise(resolve => setTimeout(resolve, 10_000)); // Wait 10s before the next request
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
