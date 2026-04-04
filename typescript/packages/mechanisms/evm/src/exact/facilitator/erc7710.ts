import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { encodeFunctionData, getAddress, isAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { ExactERC7710Payload } from "../../types";
import { getEvmChainId } from "../../utils";
import * as Errors from "./errors";

/**
 * ERC-20 `transfer(address,uint256)` ABI — used to build execution calldata.
 */
const erc20TransferABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * ERC-7710 DelegationManager ABI — only the `redeemDelegations` function.
 *
 * Per the spec:
 *   redeemDelegations(
 *     bytes[] calldata permissionContexts,
 *     bytes32[] calldata modes,
 *     bytes[] calldata executionCalldatas
 *   )
 */
const delegationManagerABI = [
  {
    inputs: [
      { name: "permissionContexts", type: "bytes[]" },
      { name: "modes", type: "bytes32[]" },
      { name: "executionCalldatas", type: "bytes[]" },
    ],
    name: "redeemDelegations",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * ERC-7579 single-call execution mode.
 * bytes32: 0x00...00 signals "single call, no value, no revert-on-failure override".
 */
const SINGLE_CALL_MODE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Builds the ERC-7579 executionCalldata for a single ERC-20 transfer.
 *
 * ERC-7579 single-call executionCalldata format:
 *   abi.encodePacked(target, value, callData)
 *   where value is uint256 (32 bytes) and callData is the selector + args.
 *
 * @param tokenAddress - ERC-20 token contract address
 * @param payTo        - Recipient address
 * @param amount       - Transfer amount (in token's smallest unit)
 * @returns ABI-packed execution calldata bytes
 */
function buildExecutionCalldata(
  tokenAddress: `0x${string}`,
  payTo: `0x${string}`,
  amount: bigint,
): `0x${string}` {
  const transferCalldata = encodeFunctionData({
    abi: erc20TransferABI,
    functionName: "transfer",
    args: [payTo, amount],
  });

  // ERC-7579 packed format: target (20 bytes) + value (32 bytes, zero) + calldata
  const target = tokenAddress.slice(2).padStart(40, "0");
  const value = "0".padStart(64, "0");
  const data = transferCalldata.slice(2);

  return `0x${target}${value}${data}`;
}

/**
 * Validates structural integrity of an ERC-7710 payload.
 * Does NOT perform on-chain checks — purely field-level validation.
 *
 * @returns null if valid, or an error reason string.
 */
function validatePayloadFields(erc7710Payload: ExactERC7710Payload): string | null {
  if (!isAddress(erc7710Payload.delegationManager)) {
    return Errors.ErrERC7710InvalidDelegationManager;
  }
  if (!isAddress(erc7710Payload.delegator)) {
    return Errors.ErrERC7710InvalidDelegator;
  }
  if (
    !erc7710Payload.permissionContext ||
    !erc7710Payload.permissionContext.startsWith("0x") ||
    erc7710Payload.permissionContext.length < 4 // at minimum "0x" + 1 byte
  ) {
    return Errors.ErrERC7710InvalidPermissionContext;
  }
  return null;
}

/**
 * Verifies an ERC-7710 payment payload via on-chain simulation.
 *
 * Per the spec, verification for ERC-7710 is performed entirely through simulation:
 * the facilitator calls `redeemDelegations` via `eth_call` to confirm the delegation
 * is valid and the transfer would succeed.
 *
 * @param signer       - The facilitator signer (needs readContract for simulation)
 * @param payload      - The full payment payload
 * @param requirements - The payment requirements
 * @param erc7710Payload - The ERC-7710 specific payload fields
 * @returns Promise resolving to a VerifyResponse
 */
export async function verifyERC7710(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  erc7710Payload: ExactERC7710Payload,
): Promise<VerifyResponse> {
  const payer = erc7710Payload.delegator;

  // Scheme + network checks
  if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
    return { isValid: false, invalidReason: Errors.ErrInvalidScheme, payer };
  }

  if (payload.accepted.network !== requirements.network) {
    return { isValid: false, invalidReason: Errors.ErrNetworkMismatch, payer };
  }

  // Field-level validation
  const fieldError = validatePayloadFields(erc7710Payload);
  if (fieldError) {
    return { isValid: false, invalidReason: fieldError, payer };
  }

  const tokenAddress = getAddress(requirements.asset);
  const payTo = getAddress(requirements.payTo);
  const amount = BigInt(requirements.amount);
  const delegationManager = getAddress(erc7710Payload.delegationManager);

  // Build the execution calldata for a single ERC-20 transfer
  const executionCalldata = buildExecutionCalldata(tokenAddress, payTo, amount);

  // Simulate redeemDelegations via eth_call.
  // Per spec: "If the simulation succeeds, the payment is considered valid."
  try {
    await signer.readContract({
      address: delegationManager,
      abi: delegationManagerABI,
      functionName: "redeemDelegations",
      args: [[erc7710Payload.permissionContext], [SINGLE_CALL_MODE], [executionCalldata]],
    });
  } catch {
    return { isValid: false, invalidReason: Errors.ErrERC7710SimulationFailed, payer };
  }

  return { isValid: true, invalidReason: undefined, payer };
}

/**
 * Settles an ERC-7710 payment by calling `redeemDelegations` on the DelegationManager.
 *
 * Flow:
 * 1. Re-verify the delegation (field + simulation checks).
 * 2. Call `redeemDelegations` — the DelegationManager validates the delegation authority
 *    and calls the delegator account, which performs `token.transfer(payTo, amount)`.
 * 3. Wait for receipt and confirm success.
 *
 * @param signer        - The facilitator signer (needs writeContract + waitForTransactionReceipt)
 * @param payload       - The full payment payload
 * @param requirements  - The payment requirements
 * @param erc7710Payload - The ERC-7710 specific payload fields
 * @returns Promise resolving to a SettleResponse
 */
export async function settleERC7710(
  signer: FacilitatorEvmSigner,
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  erc7710Payload: ExactERC7710Payload,
): Promise<SettleResponse> {
  const payer = erc7710Payload.delegator;
  const network = payload.accepted.network;

  // Re-verify before settling (field + simulation)
  const valid = await verifyERC7710(signer, payload, requirements, erc7710Payload);
  if (!valid.isValid) {
    return {
      success: false,
      network,
      transaction: "",
      errorReason: valid.invalidReason ?? Errors.ErrInvalidScheme,
      payer,
    };
  }

  const tokenAddress = getAddress(requirements.asset);
  const payTo = getAddress(requirements.payTo);
  const amount = BigInt(requirements.amount);
  const delegationManager = getAddress(erc7710Payload.delegationManager);

  const executionCalldata = buildExecutionCalldata(tokenAddress, payTo, amount);

  try {
    const tx = await signer.writeContract({
      address: delegationManager,
      abi: delegationManagerABI,
      functionName: "redeemDelegations",
      args: [[erc7710Payload.permissionContext], [SINGLE_CALL_MODE], [executionCalldata]],
    });

    const receipt = await signer.waitForTransactionReceipt({ hash: tx });

    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: Errors.ErrERC7710RedeemFailed,
        transaction: tx,
        network,
        payer,
      };
    }

    return { success: true, transaction: tx, network, payer };
  } catch {
    return {
      success: false,
      errorReason: Errors.ErrERC7710RedeemFailed,
      transaction: "",
      network,
      payer,
    };
  }
}
