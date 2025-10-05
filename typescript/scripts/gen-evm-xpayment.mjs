// Usage:
//   node scripts/gen-evm-xpayment.mjs --network bsc:mainnet --txid 0x... [--to 0x.. --amountWei 1000]
//   node scripts/gen-evm-xpayment.mjs --network bsc:mainnet --txid 0x... --erc20 0xToken --to 0x.. --amountAtomic 1000
// Prints: X-PAYMENT <base64url(JSON)>

function parseArgs() {
  const out = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "1";
    out[k] = v;
  }
  return out;
}

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

(function main() {
  const a = parseArgs();
  if (!a.network || !a.txid) {
    console.error("Required: --network <bsc:mainnet|bsc:testnet> --txid 0x...");
    process.exit(1);
  }

  const evm = { network: a.network, txid: a.txid };

  if (a.erc20) {
    if (!a.to || !a.amountAtomic) {
      console.error("ERC-20 requires --to and --amountAtomic");
      process.exit(1);
    }
    evm.asset = { kind: "erc20", contract: a.erc20, decimals: a.decimals ? Number(a.decimals) : undefined };
    evm.to = a.to;
    evm.amountAtomic = a.amountAtomic;
  } else if (a.to && a.amountWei) {
    evm.to = a.to;
    evm.amountWei = a.amountWei;
  }

  const payload = { scheme: "exact", network: "EVM", evm };
  const token = base64url(JSON.stringify(payload));
  console.log(`X-PAYMENT ${token}`);
})();
