#!/usr/bin/env tsx
import { makeBscClients } from "../../typescript/packages/x402/src/verify/evmClient";
import { verifyNativeExactByTxHash } from "../../typescript/packages/x402/src/verify/evmVerify";

/**
 * Minimal CLI example: verify native BNB exact payment on BSC by tx hash.
 *
 * Usage:
 *   tsx examples/typescript/bsc-bnb-verify.ts \
 *     --tx 0x... \
 *     --to 0xYourPayTo \
 *     --wei 10000000000000000 \  # 0.01 BNB
 *     [--allow-contract]
 *
 * Env (optional, for RPCs):
 *   BSC_RPC_PRIMARY, BSC_RPC_FALLBACK_1, BSC_RPC_FALLBACK_2
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (!k) continue;
    if (k === "--allow-contract") {
      out["allow-contract"] = true;
      continue;
    }
    const v = args[i + 1];
    if (k.startsWith("--") && v && !v.startsWith("--")) {
      out[k.slice(2)] = v;
      i++;
    }
  }
  return out as { tx: string; to: string; wei: string; "allow-contract"?: boolean };
}

async function main() {
  const { tx, to, wei, "allow-contract": allowContract } = parseArgs();
  if (!tx || !to || !wei) {
    console.error("Usage: --tx <hash> --to <address> --wei <amount> [--allow-contract]");
    process.exit(1);
  }

  const clients = makeBscClients();
  const res = await verifyNativeExactByTxHash(clients, tx as `0x${string}`, {
    to: to as `0x${string}`,
    amountWei: BigInt(wei),
    requireEmptyInput: !allowContract,
  });

  console.log(JSON.stringify(res, null, 2));
  process.exit(res.isValid ? 0 : 2);
}

main().catch(err => {
  console.error(err);
  process.exit(3);
});
