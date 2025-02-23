import { WalletClient, Hex, toHex, Transport, Chain, Address } from "viem";
import { config } from "@/shared/evm/config";

import { PaymentDetails } from "@/shared/types";
import {
  AuthorizationParameters,
  PaymentPayload,
  paymentPayloadSchema,
} from "@/shared/types/exact/evm";
import { paymentPayloadV1FromObj } from "@/shared/types/convert";
import { authorizationTypes } from "@/shared/evm/eip3009";

/**
 * Signs an EIP-3009 authorization for USDC transfer
 * @param walletClient - The wallet client that will sign the authorization
 * @param params - The authorization parameters
 * @param params.from - The address tokens will be transferred from
 * @param params.to - The address tokens will be transferred to
 * @param params.value - The amount of USDC tokens to transfer (in base units)
 * @param params.validAfter - Unix timestamp after which the authorization becomes valid
 * @param params.validBefore - Unix timestamp before which the authorization is valid
 * @param params.nonce - Random 32-byte nonce to prevent replay attacks
 * @param params.chainId - The chain ID where the USDC contract exists
 * @param params.version - The USDC contract version
 * @param params.usdcAddress - The address of the USDC contract
 * @returns The signature for the authorization
 */
export async function signAuthorization<
  transport extends Transport,
  chain extends Chain
>(
  walletClient: WalletClient<transport, chain>,
  {
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
    version,
  }: AuthorizationParameters,
  { usdcAddress, networkId }: PaymentDetails
): Promise<{ signature: Hex }> {
  const usdcName = config[networkId].usdcName;

  const data = {
    account: walletClient.account!,
    types: authorizationTypes,
    domain: {
      name: usdcName,
      version: version,
      chainId: parseInt(networkId),
      verifyingContract: usdcAddress as Address,
    },
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce: nonce,
    },
  };

  const signature = await walletClient.signTypedData(data);

  return {
    signature,
  };
}

export function createNonce(): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function encodePayment(payment: PaymentPayload): string {
  const safe = {
    ...payment,
    payload: {
      ...payment.payload,
      authorization: Object.fromEntries(
        Object.entries(payment.payload.authorization).map(([key, value]) => [
          key,
          typeof value === "bigint" ? value.toString() : value,
        ])
      ),
    },
  };
  return safeBase64Encode(JSON.stringify(safe));
}

export function decodePayment(payment: string): PaymentPayload {
  // TODO: setup proper zod validation
  const decoded = safeBase64Decode(payment);
  const parsed = JSON.parse(decoded);

  const obj = paymentPayloadV1FromObj(parsed);
  const validated = paymentPayloadSchema.parse(obj);
  return validated;
}

function safeBase64Encode(data: string): string {
  if (typeof window !== "undefined") {
    return window.btoa(data);
  }
  return Buffer.from(data).toString("base64");
}

function safeBase64Decode(data: string): string {
  if (typeof window !== "undefined") {
    return window.atob(data);
  }
  return Buffer.from(data, "base64").toString("utf-8");
}
