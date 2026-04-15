import { HTTPFacilitatorClient } from "@x402/core/server";
import { DeferredEvmScheme, FileSessionStorage } from "@x402/evm/deferred/server";
import { paymentMiddleware, setSettlementOverrides, x402ResourceServer } from "@x402/express";
import { config } from "dotenv";
import express from "express";
import { privateKeyToAccount } from "viem/accounts";

config();

const NETWORK = "eip155:84532" as const;

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const receiverAuthorizerPrivateKey = process.env.EVM_RECEIVER_AUTHORIZER_PRIVATE_KEY as
  | `0x${string}`
  | undefined;
const storageDir = process.env.STORAGE_DIR;
const withdrawDelay = Number(process.env.DEFERRED_WITHDRAW_DELAY_SECONDS ?? "900");

if (!evmAddress || !/^0x[0-9a-fA-F]{40}$/.test(evmAddress)) {
  console.error("Missing or invalid EVM_ADDRESS (checksummed 20-byte hex, 0x-prefixed)");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("Missing required FACILITATOR_URL environment variable");
  process.exit(1);
}

const receiverAuthorizerSigner = receiverAuthorizerPrivateKey
  ? privateKeyToAccount(receiverAuthorizerPrivateKey)
  : undefined;

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const deferredScheme = new DeferredEvmScheme(evmAddress, {
  ...(receiverAuthorizerSigner ? { receiverAuthorizerSigner } : {}),
  withdrawDelay,
  ...(storageDir ? { storage: new FileSessionStorage({ directory: storageDir }) } : {}),
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(NETWORK, deferredScheme);

const channelManager = deferredScheme.createChannelManager(facilitatorClient, NETWORK);

// channelManager.start({
//   tickSecs: 5, // evaluate policies every 5s
//   claimIntervalSecs: 10,
//   claimOnIdleSecs: 30,
//   claimOnWithdrawal: true,
//   settleIntervalSecs: 20,
//   settleThreshold: "1000000",
//   maxClaimsPerBatch: 50,
//   cooperativeWithdrawOnIdleSecs: 30,
//   cooperativeWithdrawOnShutdown: true,
//   onClaim: (r: { vouchers: number; transaction: string }) =>
//     console.log(`Claimed ${r.vouchers} vouchers (tx: ${r.transaction})`),
//   onSettle: (r: { transaction: string }) =>
//     console.log(`Settled to ${evmAddress} (tx: ${r.transaction})`),
//   onCooperativeWithdraw: (r: { channels: string[]; transaction: string }) =>
//     console.log(`Cooperative withdraw for ${r.channels.length} channel(s) (tx: ${r.transaction})`),
//   onError: (e: unknown) => console.error("Settlement error:", e),
// });

// process.on("SIGINT", async () => {
//   console.log("Shutting down — flushing pending claims…");
//   await channelManager.stop({ flush: true });
//   process.exit(0);
// });

const app = express();

// Authorize up to this amount per request; optional usage-based override below bills actual usage.
const maxPrice = "$0.01";

app.use(
  paymentMiddleware(
    {
      "GET /api/generate": {
        accepts: {
          scheme: "batch-settlement",
          price: maxPrice,
          network: NETWORK,
          payTo: evmAddress,
        },
        description:
          "Batch-settlement demo — voucher updates session without per-request chain settle",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/api/generate", (req, res) => {
  const chargedPercent = 1 + Math.floor(Math.random() * 100);
  setSettlementOverrides(res, { amount: `${chargedPercent}%` });

  const maxDollars = parseFloat(maxPrice.slice(1));
  const chargedDollars = (maxDollars * chargedPercent) / 100;
  const chargedPrice = `$${String(Math.round(chargedDollars * 1e6) / 1e6)}`;

  console.log("chargedPrice", chargedPrice);

  res.json({
    result: "Here is your generated text...",
    usage: {
      maxPrice,
      chargedPrice,
    },
  });
});

app.listen(4021, () => {
  console.log("Batch-settlement server listening at http://localhost:4021");
  console.log("  GET /api/generate");
  if (receiverAuthorizerSigner) {
    console.log(`  Receiver authorizer: local signer ${receiverAuthorizerSigner.address}`);
  } else {
    console.log("  Receiver authorizer: facilitator");
  }
});
