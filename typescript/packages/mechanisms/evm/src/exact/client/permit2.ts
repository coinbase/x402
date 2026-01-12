import {
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentCreationContext,
} from "@x402/core/types";
import { getAddress } from "viem";
import {
  permit2WitnessTypes,
  PERMIT2_ADDRESS,
  x402Permit2ProxyAddress,
  eip2612PermitTypes,
} from "../../constants";
import { ClientEvmSigner } from "../../signer";
import { EIP2612PermitParams, ExactPermit2Payload } from "../../types";
import { createPermit2Nonce } from "../../utils";

/**
 * Extension name for EIP-2612 gas sponsoring
 */
export const EIP2612_GAS_SPONSORING_EXTENSION = "eip2612GasSponsoring";

/**
 * Extension data for eip2612GasSponsoring.
 * Contains the EIP-2612 permit signature to approve Permit2.
 */
export interface EIP2612GasSponsoringExtension {
  permit: EIP2612PermitParams;
}

/**
 * Creates a Permit2 payload using the x402Permit2Proxy witness pattern.
 * The spender is set to x402Permit2Proxy, which enforces that funds
 * can only be sent to the witness.to address.
 *
 * If the facilitator supports eip2612GasSponsoring and the user provides
 * an EIP-2612 nonce, an approval permit will be included in extensions.
 *
 * @param signer - The EVM signer for client operations
 * @param x402Version - The x402 protocol version
 * @param paymentRequirements - The payment requirements
 * @param context - Optional context with facilitator info and EIP-2612 nonce
 * @returns Promise resolving to a payment payload result
 */
export async function createPermit2Payload(
  signer: ClientEvmSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  context?: PaymentCreationContext & { eip2612Nonce?: bigint },
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

  const result: PaymentPayloadResult = {
    x402Version,
    payload,
  };

  // Add EIP-2612 permit extension if facilitator supports it and nonce is provided
  if (context?.eip2612Nonce !== undefined && supportsEIP2612GasSponsoring(context)) {
    const permitExtension = await createEIP2612PermitExtension(
      signer,
      paymentRequirements,
      context.eip2612Nonce,
      permit2Authorization.deadline,
    );
    result.extensions = {
      [EIP2612_GAS_SPONSORING_EXTENSION]: permitExtension,
    };
  }

  return result;
}

/**
 * Check if the facilitator supports EIP-2612 gas sponsoring extension.
 */
function supportsEIP2612GasSponsoring(context: PaymentCreationContext): boolean {
  return (
    context.facilitatorSupported?.extensions?.includes(EIP2612_GAS_SPONSORING_EXTENSION) ?? false
  );
}

/**
 * Creates an EIP-2612 permit extension for approving Permit2 to spend tokens.
 * This allows the facilitator to call token.permit() before settling via Permit2.
 *
 * @param signer - The EVM signer
 * @param requirements - The payment requirements (contains token address and EIP-712 domain)
 * @param nonce - The user's current nonce for the token's permit function
 * @param deadline - When the permit expires
 * @returns The EIP-2612 permit parameters
 */
async function createEIP2612PermitExtension(
  signer: ClientEvmSigner,
  requirements: PaymentRequirements,
  nonce: bigint,
  deadline: string,
): Promise<EIP2612GasSponsoringExtension> {
  const { name, version } = requirements.extra as { name: string; version: string };
  const chainId = parseInt(requirements.network.split(":")[1]);

  // Approve Permit2 for max uint256 (standard for permits)
  const value = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

  const domain = {
    name,
    version,
    chainId,
    verifyingContract: getAddress(requirements.asset),
  };

  const message = {
    owner: signer.address,
    spender: PERMIT2_ADDRESS,
    value,
    nonce,
    deadline: BigInt(deadline),
  };

  const signature = await signer.signTypedData({
    domain,
    types: eip2612PermitTypes,
    primaryType: "Permit",
    message,
  });

  // Parse signature into v, r, s
  const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
  const v = parseInt(signature.slice(130, 132), 16);

  return {
    permit: {
      value: value.toString(),
      deadline,
      v,
      r,
      s,
    },
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
