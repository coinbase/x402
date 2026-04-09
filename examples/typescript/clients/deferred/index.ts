import { toClientEvmSigner } from "@x402/evm";
import { DeferredEvmScheme, FileClientSessionStorage, computeChannelId } from "@x402/evm/deferred/client";
import { type PaymentRequired, x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { config } from "dotenv";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

config();

/** Pretty-print JSON-serializable values (standard `JSON.stringify` indentation). */
function prettyPrint(value: unknown): void {
  const text =
    typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : String(value);
  console.log(text);
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const evmVoucherSignerPrivateKey = process.env.EVM_VOUCHER_SIGNER_PRIVATE_KEY as `0x${string}` | undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/api/generate";
const url = `${baseURL}${endpointPath}`;
const storageDir = process.env.STORAGE_DIR ?? process.env.STORAGE_DIR_DIR;
const channelSalt = (process.env.CHANNEL_SALT ??
  "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`;

async function main(): Promise<void> {
  const account = privateKeyToAccount(evmPrivateKey);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  const signer = toClientEvmSigner(account, publicClient);

  const voucherSigner =
    evmVoucherSignerPrivateKey !== undefined
      ? toClientEvmSigner(privateKeyToAccount(evmVoucherSignerPrivateKey))
      : undefined;

  const deferredScheme = new DeferredEvmScheme(signer, {
    depositPolicy: {
      maxDeposit: "1000000",
      depositMultiplier: 5,
    },
    salt: channelSalt,
    ...(voucherSigner ? { voucherSigner } : {}),
    ...(storageDir
      ? { storage: new FileClientSessionStorage({ directory: storageDir }) }
      : {}),
  });

  console.log("payer:", signer.address);
  console.log("payerAuthorizer:", voucherSigner?.address ?? signer.address);

  let lastChannelId: string | undefined;

  const client = new x402Client();
  client.register("eip155:*", deferredScheme);

  client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
    if (selectedRequirements.scheme === "batch-settlement") {
      const config = deferredScheme.buildChannelConfig(selectedRequirements);
      const channelId = computeChannelId(config);
      lastChannelId = channelId;

      if (!(await deferredScheme.hasSession(channelId))) {
        await deferredScheme.recoverSession(selectedRequirements);
      }
    }
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  console.log(`Base URL: ${baseURL}, endpoint: ${endpointPath}`);
  if (voucherSigner) {
    console.log(
      `Voucher signer (payerAuthorizer): ${voucherSigner.address} (payer: ${signer.address})\n`,
    );
  } else {
    console.log();
  }

  for (let i = 0; i < 3; i++) {
    const n = i + 1;
    const requestT0 = performance.now();

    if (i === 2 && lastChannelId) {
      //deferredScheme.requestCooperativeWithdraw(lastChannelId);
    }

    const requestInit: RequestInit = { method: "GET" };
    let response = await fetchWithPayment(url, requestInit);
    const getHeader = (name: string) => response.headers.get(name);
    let correctivePaymentRequired: PaymentRequired | undefined;

    if (response.status === 402) {
      console.log(`\nRequest ${n} — corrective PAYMENT-REQUIRED`);
      console.log("Corrective payment required");
      try {
        correctivePaymentRequired = httpClient.getPaymentRequiredResponse(getHeader);
        prettyPrint(correctivePaymentRequired);
        if (await deferredScheme.processCorrectivePaymentRequired(correctivePaymentRequired)) {
          response = await fetchWithPayment(url, requestInit);
        }
      } catch {
        // leave `response` as the corrective 402 (or invalid PAYMENT-REQUIRED)
      }
      console.log();
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body =
      response.status === 402 && correctivePaymentRequired !== undefined
        ? correctivePaymentRequired
        : contentType.includes("application/json")
          ? await response.json()
          : await response.text();

    console.log(`\nRequest ${n} — response body (HTTP ${response.status})`);
    prettyPrint(body);

    if (getHeader("PAYMENT-RESPONSE") || getHeader("X-PAYMENT-RESPONSE")) {
      const paymentResponse = httpClient.getPaymentSettleResponse(getHeader);
      console.log(`\nRequest ${n} — PAYMENT-RESPONSE`);
      prettyPrint(paymentResponse);
    } else {
      console.log(`\nRequest ${n} — PAYMENT-RESPONSE: (none, HTTP ${response.status})`);
    }

    await deferredScheme.processPaymentResponse(getHeader);

    const elapsedMs = performance.now() - requestT0;
    console.log(`\nRequest ${n} — completed in ${formatSeconds(elapsedMs)}s\n`);
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
