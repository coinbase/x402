import { HTTPFacilitatorClient } from "@x402/core/server";
import { getDefaultAsset } from "@x402/evm";
import {
  createDeferredEscrowWalletClient,
  DeferredEvmScheme,
  ensureDeferredServiceRegistered,
} from "@x402/evm/deferred/server";
import { paymentMiddleware, setSettlementOverrides, x402ResourceServer } from "@x402/express";
import { config } from "dotenv";
import express from "express";
import { http } from "viem";
import { baseSepolia } from "viem/chains";

config();

const NETWORK = "eip155:84532" as const;

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const serviceId = process.env.SERVICE_ID as `0x${string}`;
const serverPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined;

if (!evmAddress || !/^0x[0-9a-fA-F]{40}$/.test(evmAddress)) {
  console.error("Missing or invalid EVM_ADDRESS (checksummed 20-byte hex, 0x-prefixed)");
  process.exit(1);
}
if (!serviceId || !/^0x[0-9a-fA-F]{64}$/.test(serviceId)) {
  console.error("Missing or invalid SERVICE_ID (32-byte hex, 0x-prefixed)");
  process.exit(1);
}
if (!serverPrivateKey) {
  console.error("Missing required SERVER_EVM_PRIVATE_KEY (pays gas; used as EIP-712 authorizer in this demo)");
  process.exit(1);
}

const withdrawWindow = BigInt(process.env.DEFERRED_WITHDRAW_WINDOW_SECONDS ?? "600"); // 10 minutes

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("Missing required FACILITATOR_URL environment variable");
  process.exit(1);
}

const walletClient = createDeferredEscrowWalletClient({
  privateKey: serverPrivateKey,
  chain: baseSepolia,
  transport: http(),
});

const tokenAddress = getDefaultAsset(NETWORK).address as `0x${string}`;
const authorizer = walletClient.account.address;

const registration = await ensureDeferredServiceRegistered(walletClient, {
  serviceId,
  payTo: evmAddress,
  token: tokenAddress,
  authorizer,
  withdrawWindow,
});

if (registration.alreadyRegistered) {
  console.info(`DeferredEscrow: service ${serviceId.slice(0, 10)}… already registered`);
} else {
  console.info(`DeferredEscrow: registered service (${registration.txHash})`);
}

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

const deferredScheme = new DeferredEvmScheme(serviceId); // Uses in-memory session storage by default
//const deferredScheme = new DeferredEvmScheme(serviceId, { storage: new RedisSessionStorage(...) }); // Custom (Redis, database, etc. for production)

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, deferredScheme)
  .onAfterVerify(deferredScheme.lifecycleHooks.onAfterVerify)
  .onBeforeSettle(deferredScheme.lifecycleHooks.onBeforeSettle)
  .onAfterSettle(deferredScheme.lifecycleHooks.onAfterSettle)

const app = express();

// Authorize up to this amount per request; optional usage-based override below bills actual usage.
const maxPrice = "$0.01";

app.use(
  paymentMiddleware(
    {
      "GET /api/generate": {
        accepts: {
          scheme: "deferred",
          price: maxPrice,
          network: NETWORK,
          payTo: evmAddress,
        },
        description: "Deferred subchannel demo — voucher updates session without per-request chain settle",
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

  res.json({
    result: "Here is your generated text...",
    usage: {
      maxPrice,
      chargedPrice,
    },
  });
});

app.listen(4021, () => {
  console.log("Deferred server listening at http://localhost:4021");
  console.log("  GET /api/generate  — deferred scheme with session hooks (voucher path skips chain settle)");
});
