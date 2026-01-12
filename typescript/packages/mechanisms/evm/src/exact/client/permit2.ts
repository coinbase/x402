import { PaymentRequirements, PaymentPayloadResult } from "@x402/core/types";
import { getAddress } from "viem";
import { permit2WitnessTypes, PERMIT2_ADDRESS, x402Permit2ProxyAddress } from "../../constants";
import { ClientEvmSigner } from "../../signer";
import { ExactPermit2Payload } from "../../types";
import { createPermit2Nonce } from "../../utils";

/**
 * Creates a Permit2 payload using the x402Permit2Proxy witness pattern.
 * The spender is set to x402Permit2Proxy, which enforces that funds
 * can only be sent to the witness.to address.
 *
 * @param signer - The EVM signer for client operations
 * @param x402Version - The x402 protocol version
 * @param paymentRequirements - The payment requirements
 * @returns Promise resolving to a payment payload result
 */
export async function createPermit2Payload(
  signer: ClientEvmSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
): Promise<PaymentPayloadResult> {
  const now = Math.floor(Date.now() / 1000);
  const nonce = createPermit2Nonce();

  const validAfter = (now - 600).toString();
  const validBefore = (now + paymentRequirements.maxTimeoutSeconds).toString();
  const deadline = validBefore;

  const permit2Authorization: ExactPermit2Payload["permit2Authorization"] = {
    from: signer.address,
    permitted: {
      token: getAddress(paymentRequirements.asset),
      amount: paymentRequirements.amount,
    },
    spender: x402Permit2ProxyAddress,
    nonce,
    deadline,
    witness: {
      to: getAddress(paymentRequirements.payTo),
      validAfter,
      validBefore,
      extra: "0x",
    },
  };

  const signature = await signPermit2Authorization(
    signer,
    permit2Authorization,
    paymentRequirements,
  );

  const payload: ExactPermit2Payload = {
    signature,
    permit2Authorization,
  };

  return {
    x402Version,
    payload,
  };
}

/**
 * Sign the Permit2 authorization using EIP-712 with witness data.
 * The signature authorizes the x402Permit2Proxy to transfer tokens on behalf of the signer.
 *
 * @param signer - The EVM signer
 * @param permit2Authorization - The Permit2 authorization parameters
 * @param requirements - The payment requirements
 * @returns Promise resolving to the signature
 */
async function signPermit2Authorization(
  signer: ClientEvmSigner,
  permit2Authorization: ExactPermit2Payload["permit2Authorization"],
  requirements: PaymentRequirements,
): Promise<`0x${string}`> {
  const chainId = parseInt(requirements.network.split(":")[1]);

  const domain = {
    name: "Permit2",
    chainId,
    verifyingContract: PERMIT2_ADDRESS,
  };

  const message = {
    permitted: {
      token: getAddress(permit2Authorization.permitted.token),
      amount: BigInt(permit2Authorization.permitted.amount),
    },
    spender: getAddress(permit2Authorization.spender),
    nonce: BigInt(permit2Authorization.nonce),
    deadline: BigInt(permit2Authorization.deadline),
    witness: {
      extra: permit2Authorization.witness.extra,
      to: getAddress(permit2Authorization.witness.to),
      validAfter: BigInt(permit2Authorization.witness.validAfter),
      validBefore: BigInt(permit2Authorization.witness.validBefore),
    },
  };

  return await signer.signTypedData({
    domain,
    types: permit2WitnessTypes,
    primaryType: "PermitWitnessTransferFrom",
    message,
  });
}
