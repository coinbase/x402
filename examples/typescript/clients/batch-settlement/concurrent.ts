import { toClientEvmSigner } from "@x402/evm";
import { BatchSettlementEvmScheme, FileClientSessionStorage } from "@x402/evm/batch-settlement/client";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { config } from "dotenv";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

config();

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/** Derive a unique salt by adding an integer offset to a base bytes32 value. */
function saltAdd(base: `0x${string}`, offset: number): `0x${string}` {
  return `0x${(BigInt(base) + BigInt(offset)).toString(16).padStart(64, "0")}` as `0x${string}`;
}

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const evmVoucherSignerPrivateKey = process.env.EVM_VOUCHER_SIGNER_PRIVATE_KEY as
  | `0x${string}`
  | undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/api/generate";
const url = `${baseURL}${endpointPath}`;
const storageDir = process.env.STORAGE_DIR ?? process.env.STORAGE_DIR_DIR;
const baseSalt = (process.env.CHANNEL_SALT ??
  "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`;
const numberOfChannels = Number(process.env.NUMBER_OF_CHANNELS ?? "3");

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

  console.log(`Base URL: ${baseURL}, endpoint: ${endpointPath}`);
  console.log("payer:", signer.address);
  console.log("payerAuthorizer:", voucherSigner?.address ?? signer.address);
  console.log(`Concurrency: ${CONCURRENCY} channels\n`);

  // Each concurrent slot gets its own channel (unique salt) so the server
  // can process them in parallel — it serialises per channel, not globally.
  const channels = Array.from({ length: CONCURRENCY }, (_, i) => {
    const salt = saltAdd(baseSalt, i);
    const scheme = new BatchSettlementEvmScheme(signer, {
      depositPolicy: { maxDeposit: "1000000", depositMultiplier: 5 },
      salt,
      ...(voucherSigner ? { voucherSigner } : {}),
      ...(storageDir ? { storage: new FileClientSessionStorage({ directory: storageDir }) } : {}),
    });

    const client = new x402Client();
    client.register("eip155:*", scheme);

    return {
      index: i,
      salt,
      fetchWithPayment: wrapFetchWithPayment(fetch, client),
      httpClient: new x402HTTPClient(client),
    };
  });

  console.log("Channels:");
  for (const ch of channels) {
    console.log(`  [${ch.index}] salt ${ch.salt}`);
  }
  console.log();

  const totalT0 = performance.now();

  for (let round = 0; round < numberOfChannels; round++) {
    const roundT0 = performance.now();

    const results = await Promise.all(
      channels.map(async ch => {
        const reqT0 = performance.now();
        const response = await ch.fetchWithPayment(url, { method: "GET" });
        const result = await ch.httpClient.processResponse(response);
        const elapsed = performance.now() - reqT0;
        return { ch, result, elapsed };
      }),
    );

    const roundElapsed = performance.now() - roundT0;

    console.log(`── Round ${round + 1}/${numberOfChannels} — ${formatSeconds(roundElapsed)}s ──`);
    for (const { ch, result, elapsed } of results) {
      const tag = `  [ch ${ch.index}]`;
      if (result.kind === "success") {
        const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
        console.log(`${tag} ${formatSeconds(elapsed)}s — ${body}`);
      } else {
        console.log(`${tag} ${formatSeconds(elapsed)}s — (no success body)`);
      }
    }
    console.log();
  }

  const totalElapsed = performance.now() - totalT0;
  console.log(
    `${numberOfChannels} rounds × ${CONCURRENCY} channels = ${numberOfChannels * CONCURRENCY} requests in ${formatSeconds(totalElapsed)}s`,
  );
}

main().catch(error => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
