import {
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentCreationContext,
} from "@x402/core/types";
import { encodeFunctionData, getAddress } from "viem";
import {
  permit2WitnessTypes,
  PERMIT2_ADDRESS,
  x402ExactPermit2ProxyAddress,
  eip2612PermitTypes,
} from "../../constants";
import { ClientEvmSigner } from "../../signer";
import { ExactPermit2Payload } from "../../types";
import { createPermit2Nonce } from "../../utils";

/** Maximum uint256 value for unlimited approval. */
const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

/**
 * Extension name for EIP-2612 gas sponsoring
 */
export const EIP2612_GAS_SPONSORING_EXTENSION = "eip2612GasSponsoring";

/**
 * Extension data for eip2612GasSponsoring.
 * Contains the EIP-2612 permit info to approve Permit2.
 */
export interface EIP2612GasSponsoringExtension {
  info: {
    from: string;
    asset: string;
    spender: string;
    amount: string;
    nonce: string;
    deadline: string;
    signature: string;
    version: string;
  };
}

/**
 * Input data for eip2612GasSponsoring extension.
 * Populated by beforePaymentCreation hooks via context.extensionData.
 */
export interface EIP2612GasSponsoringInput {
  nonce: bigint;
}

/**
 * Creates a Permit2 payload using the x402Permit2Proxy witness pattern.
 * The spender is set to x402Permit2Proxy, which enforces that funds
 * can only be sent to the witness.to address.
 *
 * If extensionData contains eip2612GasSponsoring input (populated by a
 * beforePaymentCreation hook), an approval permit will be included in extensions.
 *
 * @param signer - The EVM signer for client operations
 * @param x402Version - The x402 protocol version
 * @param paymentRequirements - The payment requirements
 * @param context - Optional context with extension data from hooks
 * @returns Promise resolving to a payment payload result
 */
export async function createPermit2Payload(
  signer: ClientEvmSigner,
  x402Version: number,
  paymentRequirements: PaymentRequirements,
  context?: PaymentCreationContext,
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
    spender: x402ExactPermit2ProxyAddress,
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

  // Add EIP-2612 permit extension if hook provided input via extensionData
  // (Hook is responsible for checking facilitator support before populating this)
  const eip2612Input = context?.extensionData?.[EIP2612_GAS_SPONSORING_EXTENSION] as
    | EIP2612GasSponsoringInput
    | undefined;
  if (eip2612Input?.nonce !== undefined) {
    const permitExtension = await createEIP2612PermitExtension(
      signer,
      paymentRequirements,
      eip2612Input.nonce,
      permit2Authorization.deadline,
    );
    result.extensions = {
      [EIP2612_GAS_SPONSORING_EXTENSION]: permitExtension,
    };
  }

  return result;
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
  const { name, version: tokenVersion } = requirements.extra as { name: string; version: string };
  const chainId = parseInt(requirements.network.split(":")[1]);

  // Approve Permit2 for max uint256 (standard for permits)
  const amount = MAX_UINT256;

  const domain = {
    name,
    version: tokenVersion,
    chainId,
    verifyingContract: getAddress(requirements.asset),
  };

  const message = {
    owner: signer.address,
    spender: PERMIT2_ADDRESS,
    value: amount,
    nonce,
    deadline: BigInt(deadline),
  };

  const signature = await signer.signTypedData({
    domain,
    types: eip2612PermitTypes,
    primaryType: "Permit",
    message,
  });

  return {
    info: {
      from: signer.address,
      asset: getAddress(requirements.asset),
      spender: PERMIT2_ADDRESS,
      amount: amount.toString(),
      nonce: nonce.toString(),
      deadline,
      signature,
      version: "1",
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

/**
 * ERC20 approve ABI for encoding approval transactions.
 */
const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

/**
 * ERC20 allowance ABI for checking approval status.
 */
export const erc20AllowanceAbi = [
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * Creates transaction data to approve Permit2 to spend tokens.
 * The user sends this transaction (paying gas) before using Permit2 flow.
 *
 * @param tokenAddress - The ERC20 token contract address
 * @returns Transaction data to send for approval
 *
 * @example
 * ```typescript
 * const tx = createPermit2ApprovalTx("0x...");
 * await walletClient.sendTransaction({
 *   to: tx.to,
 *   data: tx.data,
 * });
 * ```
 */
export function createPermit2ApprovalTx(tokenAddress: `0x${string}`): {
  to: `0x${string}`;
  data: `0x${string}`;
} {
  const data = encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [PERMIT2_ADDRESS, MAX_UINT256],
  });

  return {
    to: getAddress(tokenAddress),
    data,
  };
}

/**
 * Parameters for checking Permit2 allowance.
 * Application provides these to check if approval is needed.
 */
export interface Permit2AllowanceParams {
  tokenAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  requiredAmount: bigint;
}

/**
 * Checks if the user has sufficient Permit2 allowance.
 * Returns the allowance check parameters for use with a public client.
 *
 * @param params - The allowance check parameters
 * @returns Contract read parameters for checking allowance
 *
 * @example
 * ```typescript
 * const readParams = getPermit2AllowanceReadParams({
 *   tokenAddress: "0x...",
 *   ownerAddress: "0x...",
 *   requiredAmount: BigInt("1000000"),
 * });
 *
 * const allowance = await publicClient.readContract(readParams);
 * const needsApproval = allowance < params.requiredAmount;
 * ```
 */
export function getPermit2AllowanceReadParams(params: Permit2AllowanceParams): {
  address: `0x${string}`;
  abi: typeof erc20AllowanceAbi;
  functionName: "allowance";
  args: [`0x${string}`, `0x${string}`];
} {
  return {
    address: getAddress(params.tokenAddress),
    abi: erc20AllowanceAbi,
    functionName: "allowance",
    args: [getAddress(params.ownerAddress), PERMIT2_ADDRESS],
  };
}
