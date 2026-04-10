import { toClientEvmSigner } from "@x402/evm";
import { DeferredEvmScheme, FileClientSessionStorage } from "@x402/evm/deferred/client";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { config } from "dotenv";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

config();

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const evmVoucherSignerPrivateKey = process.env.EVM_VOUCHER_SIGNER_PRIVATE_KEY as
  | `0x${string}`
  | undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/api/generate";
const url = `${baseURL}${endpointPath}`;
const storageDir = process.env.STORAGE_DIR ?? process.env.STORAGE_DIR_DIR;
const channelSalt = (process.env.CHANNEL_SALT ??
  "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`;
const numberOfRequests = Number(process.env.NUMBER_OF_REQUESTS ?? "3");

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
    ...(storageDir ? { storage: new FileClientSessionStorage({ directory: storageDir }) } : {}),
  });

  const client = new x402Client();
  client.register("eip155:*", deferredScheme);

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  let channelId: string | undefined;

  console.log(`Base URL: ${baseURL}, endpoint: ${endpointPath}`);
  console.log("payer:", signer.address);
  console.log("payerAuthorizer:", voucherSigner?.address ?? signer.address, "\n");

  for (let i = 0; i < numberOfRequests; i++) {
    const requestT0 = performance.now();

    if (i === numberOfRequests - 1 && channelId) {
      //console.log(`REQUESTING COOPERATIVE WITHDRAW`);
      //deferredScheme.requestCooperativeWithdraw(channelId);
    }

    const response = await fetchWithPayment(url, { method: "GET" });
    const result = await httpClient.processResponse(response);

    if (result.kind === "success") {
      console.log(`Request ${i + 1} — RESPONSE`);
      console.log(result.body);
      console.log(JSON.stringify(result.settleResponse, null, 2));
      if (result.settleResponse.extra) channelId = result.settleResponse.extra.channelId;
    }
    console.log(
      `Request ${i + 1} — completed in ${formatSeconds(performance.now() - requestT0)}s\n`,
    );
  }
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
