import { PaymentPayloadResult, PaymentRequirements } from "@x402/core/types";
import { encodeAbiParameters, getAddress, keccak256 } from "viem";
import {
  receiveAuthorizationTypes,
  uptoErc3009NonceTypehash,
  x402UptoErc3009ProxyAddress,
} from "../../constants";
import { ClientEvmSigner } from "../../signer";
import { UptoEIP3009Payload } from "../../types";
import { createNonce, getEvmChainId } from "../../utils";

/**
 * Computes the nonce commitment consumed by x402UptoERC3009Proxy.
 *
 * @param payTo - Payment recipient.
 * @param settler - Address authorized to choose the settlement amount.
 * @param salt - Fresh random bytes32 salt.
 * @returns The ERC-3009 nonce commitment.
 */
export function createUptoEIP3009Nonce(
  payTo: `0x${string}`,
  settler: `0x${string}`,
  salt: `0x${string}`,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "bytes32" }],
      [uptoErc3009NonceTypehash, getAddress(payTo), getAddress(settler), salt],
    ),
  );
}

/**
 * Creates an upto ERC-3009 ReceiveWithAuthorization payload.
 *
 * @param signer - Payer signer.
 * @param x402Version - x402 protocol version.
 * @param paymentRequirements - Maximum payment and EIP-712 token metadata.
 * @returns The signed upto ERC-3009 payload.
 */
export async function createUptoEIP3009Payload(
  signer: ClientEvmSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayloadResult> {
  const name = paymentRequirements.extra?.name;
  const version = paymentRequirements.extra?.version;
  const settlerAddress = paymentRequirements.extra?.settlerAddress;
  if (typeof name !== "string" || typeof version !== "string") {
    throw new Error(
      `EIP-712 domain parameters (name, version) are required in payment requirements for asset ${paymentRequirements.asset}`,
    );
  }
  if (typeof settlerAddress !== "string") {
    throw new Error(
      "upto eip3009 requires settlerAddress in paymentRequirements.extra. " +
        "Ensure the server is configured with an upto facilitator that provides getExtra().",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const validAfter = "0";
  const validBefore = (now + paymentRequirements.maxTimeoutSeconds).toString();
  if (BigInt(validBefore) <= BigInt(validAfter)) {
    throw new Error(
      `Invalid time window: validBefore (${validBefore}) must be after validAfter (${validAfter}).`,
    );
  }

  const salt = createNonce();
  const payTo = getAddress(paymentRequirements.payTo);
  const settler = getAddress(settlerAddress);
  const authorization: UptoEIP3009Payload["authorization"] = {
    from: getAddress(signer.address),
    to: x402UptoErc3009ProxyAddress,
    value: paymentRequirements.amount,
    validAfter,
    validBefore,
    nonce: createUptoEIP3009Nonce(payTo, settler, salt),
  };
  const paymentInfo: UptoEIP3009Payload["paymentInfo"] = { payTo, settler, salt };

  const signature = await signer.signTypedData({
    domain: {
      name,
      version,
      chainId: getEvmChainId(paymentRequirements.network),
      verifyingContract: getAddress(paymentRequirements.asset),
    },
    types: receiveAuthorizationTypes,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });

  return {
    x402Version,
    payload: { signature, authorization, paymentInfo } satisfies UptoEIP3009Payload,
  };
}
