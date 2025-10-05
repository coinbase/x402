#!/usr/bin/env tsx
import { makeBscTestnetClients } from "../../typescript/packages/x402/src/verify/evmClient";
import { verifyErc20ExactByTxHash } from "../../typescript/packages/x402/src/verify/evmVerify";

/**
 * Verify SDT (mock ERC-20 on BSC testnet) exact payment by tx hash.
 *
 * Usage:
 *   tsx examples/typescript/bsc-testnet-sdt-verify.ts \
 *     --tx 0x... \
 *     --to 0xYourPayTo \
 *     --amount 100000
 *
 * Token (SDT) address is fixed from config: 0x64544969ed7EBf5f083679233325356EbE738930
 * RPC env (optional): BSC_TESTNET_RPC_PRIMARY, BSC_TESTNET_RPC_FALLBACK_1, BSC_TESTNET_RPC_FALLBACK_2
 */

const SDT = "0x64544969ed7EBf5f083679233325356EbE738930" as const;

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (k?.startsWith("--") && v) out[k.slice(2)] = v;
  }
  return out as { tx: string; to: string; amount: string };
}

async function main() {
  const { tx, to, amount } = parseArgs();
  if (!tx || !to || !amount) {
    console.error("Usage: --tx <hash> --to <address> --amount <atomic>");
    process.exit(1);
  }

  const clients = makeBscTestnetClients();
  const res = await verifyErc20ExactByTxHash(clients, tx as `0x${string}`, {
    token: SDT,
    to: to as `0x${string}`,
    amountAtomic: BigInt(amount),
  });

  console.log(JSON.stringify(res, null, 2));
  process.exit(res.isValid ? 0 : 2);
}

main().catch(err => {
  console.error(err);
  process.exit(3);
});
