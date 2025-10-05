#!/usr/bin/env tsx
import { makeBscClients } from "../../typescript/packages/x402/src/verify/evmClient";
import { verifyErc20ExactByTxHash } from "../../typescript/packages/x402/src/verify/evmVerify";

/**
 * Minimal CLI example: verify ERC-20 (USDC) exact payment on BSC by tx hash.
 *
 * Usage:
 *   tsx examples/typescript/bsc-erc20-verify.ts \
 *     --tx 0x... \
 *     --token 0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d \
 *     --to 0xYourPayTo \
 *     --amount 100000
 *
 * Env (optional, for RPCs):
 *   BSC_RPC_PRIMARY, BSC_RPC_FALLBACK_1, BSC_RPC_FALLBACK_2
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (k?.startsWith("--") && v) out[k.slice(2)] = v;
  }
  return out as { tx: string; token: string; to: string; amount: string };
}

async function main() {
  const { tx, token, to, amount } = parseArgs();
  if (!tx || !token || !to || !amount) {
    console.error("Usage: --tx <hash> --token <address> --to <address> --amount <atomic>");
    process.exit(1);
  }

  const clients = makeBscClients();
  const res = await verifyErc20ExactByTxHash(clients, tx as `0x${string}`, {
    token: token as `0x${string}`,
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
