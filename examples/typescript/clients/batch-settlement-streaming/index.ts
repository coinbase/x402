import { toClientEvmSigner } from "@x402/evm";
import {
  BatchSettlementEvmScheme,
  FileClientSessionStorage,
  computeChannelId,
} from "@x402/evm/batch-settlement/client";
import { x402Client, x402HTTPClient } from "@x402/fetch";
import {
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import type { ChannelConfig } from "@x402/evm";
import { config } from "dotenv";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  formatIndentedJson,
  getHeaderValue,
  isTruthyEnvFlag,
  parseClientCliOptions,
  parseSSE,
  readNodeResponseText,
  streamRequest,
} from "./utils";

config();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const evmVoucherSignerPrivateKey = process.env
  .EVM_VOUCHER_SIGNER_PRIVATE_KEY as `0x${string}` | undefined;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const channelSalt = (process.env.CHANNEL_SALT ??
  "0x0000000000000000000000000000000000000000000000000000000000000000") as `0x${string}`;
const storageDir = process.env.STORAGE_DIR;
const cliOptions = parseClientCliOptions(process.argv.slice(2));
const prompt =
  cliOptions.prompt ??
  process.env.PROMPT ??
  "Tell me a fun fact about payments.";
const verbose = cliOptions.verbose || isTruthyEnvFlag(process.env.VERBOSE);
const depositPolicy = {
  maxDeposit: "1000000",
  depositMultiplier: 5,
};

// ---------------------------------------------------------------------------
// SDK wiring
// ---------------------------------------------------------------------------

const account = privateKeyToAccount(evmPrivateKey);
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
const signer = toClientEvmSigner(account, publicClient);

const voucherSigner = evmVoucherSignerPrivateKey
  ? toClientEvmSigner(privateKeyToAccount(evmVoucherSignerPrivateKey))
  : undefined;

const effectiveVoucherSigner = voucherSigner ?? signer;

const batchedScheme = new BatchSettlementEvmScheme(signer, {
  depositPolicy,
  salt: channelSalt,
  ...(voucherSigner ? { voucherSigner } : {}),
  ...(storageDir
    ? { storage: new FileClientSessionStorage({ directory: storageDir }) }
    : {}),
});

const client = new x402Client();
client.register("eip155:*", batchedScheme);

const httpClient = new x402HTTPClient(client);

function logVerbose(message: string): void {
  if (!verbose) return;
  console.log(message);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const streamURL = `${baseURL}/llm/stream?prompt=${encodeURIComponent(prompt)}`;

  console.log(`Server: ${baseURL}`);
  console.log(`Payer: ${signer.address}`);
  console.log(`VoucherSigner: ${effectiveVoucherSigner.address}`);
  console.log(`Prompt: "${prompt}"\n`);

  // Initial fetch — no payment → expect 402
  console.log("--- Initial request (no payment) ---");
  const initial = await fetch(streamURL);
  if (initial.status !== 402) {
    console.log(`Unexpected status ${initial.status}, expected 402`);
    console.log(await initial.text());
    return;
  }

  // Parse 402 response
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name: string) => initial.headers.get(name),
    await initial.json(),
  );
  console.log("Received 402 — payment required");

  // Create payment payload (handles deposit + first voucher automatically)
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const paymentHeaders =
    httpClient.encodePaymentSignatureHeader(paymentPayload);

  // Derive channel info for later voucher renewal
  const requirements: PaymentRequirements = paymentPayload.accepted;
  const channelConfig: ChannelConfig =
    batchedScheme.buildChannelConfig(requirements);
  const channelId = computeChannelId(channelConfig);
  console.log(`Channel: ${channelId}\n`);

  // 4. Retry with payment — this time we get an SSE stream
  console.log("--- Paid request (SSE stream) ---");
  const paid = await streamRequest(streamURL, paymentHeaders);
  if (paid.statusCode !== 200) {
    console.log(`Unexpected status ${paid.statusCode ?? "unknown"}`);
    console.log(await readNodeResponseText(paid));
    return;
  }

  // 5. Consume the SSE stream
  let tokenCount = 0;
  let vouchersSent = 1;
  const streamedTokens: string[] = [];

  for await (const { event, data } of parseSSE(paid)) {
    switch (event) {
      case "data": {
        const { token } = JSON.parse(data) as { token: string; index: number };
        streamedTokens.push(token);
        tokenCount++;
        process.stdout.write(token);
        break;
      }

      case "x402-voucher-needed": {
        const {
          channelId: renewalChannelId,
          chargedCumulativeAmount,
          balance,
          nextMaxClaimableAmount,
          voucherEndpoint,
        } = JSON.parse(data) as {
          channelId: string;
          chargedCumulativeAmount: string;
          balance: string;
          nextMaxClaimableAmount: string;
          voucherEndpoint: string;
        };

        logVerbose(
          `\n  [voucher-needed] charged=${chargedCumulativeAmount} balance=${balance} next=${nextMaxClaimableAmount}`,
        );

        await batchedScheme.processSettleResponse({
          success: true,
          transaction: "",
          network: requirements.network,
          payer: signer.address,
          amount: requirements.amount,
          extra: {
            channelId: renewalChannelId,
            chargedCumulativeAmount,
            balance,
          },
        });

        const nextPayment = await batchedScheme.createPaymentPayload(
          paymentPayload.x402Version,
          requirements,
        );
        const renewalPayload: PaymentPayload = {
          x402Version: nextPayment.x402Version,
          accepted: requirements,
          payload: nextPayment.payload,
        };
        const toppedUp =
          (renewalPayload.payload as Record<string, unknown>).type ===
          "deposit";

        // POST to the side-channel endpoint
        const encoded = encodePaymentSignatureHeader(renewalPayload);
        const renewURL = `${baseURL}${voucherEndpoint}`;
        const renewResponse = await fetch(renewURL, {
          method: "POST",
          headers: {
            "PAYMENT-SIGNATURE": encoded,
            "Content-Type": "application/json",
          },
        });

        if (!renewResponse.ok) {
          console.error(`  [voucher-renewal FAILED] ${renewResponse.status}`);
          console.error(await renewResponse.text());
        } else {
          vouchersSent++;
          logVerbose(toppedUp ? "  [top-up posted]" : "  [voucher posted]");
        }
        break;
      }

      case "x402-voucher-accepted": {
        const {
          channelId: acceptedChannelId,
          newChargedCumulativeAmount,
          balance,
          toppedUp,
        } = JSON.parse(data) as {
          channelId: string;
          newChargedCumulativeAmount: string;
          balance: string;
          toppedUp: boolean;
        };
        await batchedScheme.processSettleResponse({
          success: true,
          transaction: "",
          network: requirements.network,
          payer: signer.address,
          amount: requirements.amount,
          extra: {
            channelId: acceptedChannelId,
            chargedCumulativeAmount: newChargedCumulativeAmount,
            balance,
          },
        });
        logVerbose(
          `  [voucher-accepted] charged=${newChargedCumulativeAmount} balance=${balance}${toppedUp ? " (topped up)" : ""}`,
        );
        break;
      }

      case "x402-settlement": {
        const settleData = JSON.parse(data) as {
          channelId: string;
          chargedCumulativeAmount: string;
          signedMaxClaimable: string;
        };
        logVerbose(
          `\n  [settlement] charged=${settleData.chargedCumulativeAmount} signed=${settleData.signedMaxClaimable}`,
        );

        // Sync local session state
        await batchedScheme.processSettleResponse({
          success: true,
          transaction: "",
          network: requirements.network,
          payer: signer.address,
          amount: requirements.amount,
          extra: {
            channelId: settleData.channelId,
            chargedCumulativeAmount: settleData.chargedCumulativeAmount,
          },
        });
        break;
      }

      case "x402-error": {
        const { code, message } = JSON.parse(data) as {
          code: string;
          message: string;
        };
        console.error(`\n  [ERROR] ${code}: ${message}`);
        break;
      }

      case "done": {
        break;
      }

      default:
        break;
    }
  }

  const paymentResponseHeader =
    getHeaderValue(paid.trailers, "payment-response") ??
    getHeaderValue(paid.headers, "payment-response");
  if (paymentResponseHeader) {
    const paymentResponse = decodePaymentResponseHeader(paymentResponseHeader);
    console.log(
      `\n\n[PAYMENT-RESPONSE]\n${formatIndentedJson(paymentResponse)}`,
    );
    await batchedScheme.processSettleResponse(paymentResponse);
  }

  console.log("\n\n--- Summary ---");
  console.log(`Tokens received: ${tokenCount}`);
  console.log(`Vouchers sent: ${vouchersSent}`);
}

main().catch((error) => {
  console.error(error?.response?.data?.error ?? error);
  process.exit(1);
});
