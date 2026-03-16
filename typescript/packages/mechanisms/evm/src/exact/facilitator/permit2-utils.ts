import { PaymentPayload, SettleResponse, VerifyResponse } from "@x402/core/types";
import { encodeFunctionData, getAddress } from "viem";
import {
  eip3009ABI,
  erc20AllowanceAbi,
  ERC20_APPROVE_GAS_LIMIT,
  DEFAULT_MAX_FEE_PER_GAS,
  PERMIT2_ADDRESS,
  x402ExactPermit2ProxyABI,
  x402ExactPermit2ProxyAddress,
} from "../../constants";
import {
  multicall,
  ContractCall,
  MULTICALL3_ADDRESS,
  multicall3GetEthBalanceAbi,
} from "../../multicall";
import { FacilitatorEvmSigner } from "../../signer";
import { ExactPermit2Payload } from "../../types";
import {
  validateEip2612GasSponsoringInfo,
  type Eip2612GasSponsoringInfo,
  type Erc20ApprovalGasSponsoringSigner,
} from "../extensions";
import * as Errors from "./errors";

/**
 * Simulates settle() via eth_call (readContract).
 * Returns true if simulation succeeded, false if it failed.
 *
 * @param signer - EVM signer for contract reads
 * @param permit2Payload - Permit2 payload with authorization and signature
 * @returns true if simulation succeeded, false if it failed
 */
export async function simulatePermit2Settle(
  signer: FacilitatorEvmSigner,
  permit2Payload: ExactPermit2Payload,
): Promise<boolean> {
  try {
    await signer.readContract({
      address: x402ExactPermit2ProxyAddress,
      abi: x402ExactPermit2ProxyABI,
      functionName: "settle",
      args: buildPermit2SettleArgs(permit2Payload),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Splits a 65-byte EIP-2612 signature into v, r, s components for contract calls.
 * Validates length and throws if invalid.
 *
 * @param signature - The hex-encoded 65-byte signature
 * @returns Object with v (uint8), r (bytes32), s (bytes32)
 */
export function splitEip2612Signature(signature: string): {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
} {
  const sig = signature.startsWith("0x") ? signature.slice(2) : signature;

  if (sig.length !== 130) {
    throw new Error(
      `invalid EIP-2612 signature length: expected 65 bytes (130 hex chars), got ${sig.length / 2} bytes`,
    );
  }

  const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
  const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
  const v = parseInt(sig.slice(128, 130), 16);

  return { v, r, s };
}

/**
 * Builds the args array for settle() and settleWithPermit() Permit2 calls.
 * Shared by simulation and settlement to keep contract ABI shape in one place.
 *
 * @param permit2Payload - The Permit2 authorization payload
 * @returns The args tuple for settle(permit, owner, witness, signature)
 */
export function buildPermit2SettleArgs(permit2Payload: ExactPermit2Payload) {
  return [
    {
      permitted: {
        token: getAddress(permit2Payload.permit2Authorization.permitted.token),
        amount: BigInt(permit2Payload.permit2Authorization.permitted.amount),
      },
      nonce: BigInt(permit2Payload.permit2Authorization.nonce),
      deadline: BigInt(permit2Payload.permit2Authorization.deadline),
    },
    getAddress(permit2Payload.permit2Authorization.from),
    {
      to: getAddress(permit2Payload.permit2Authorization.witness.to),
      validAfter: BigInt(permit2Payload.permit2Authorization.witness.validAfter),
    },
    permit2Payload.signature,
  ] as const;
}

/**
 * Encodes settle() calldata for the x402 Exact Permit2 proxy.
 * Used when bundling approve + settle (e.g. ERC-20 approval gas sponsoring).
 *
 * @param permit2Payload - The Permit2 authorization payload
 * @returns Hex-encoded settle calldata
 */
export function encodePermit2SettleCalldata(permit2Payload: ExactPermit2Payload): `0x${string}` {
  return encodeFunctionData({
    abi: x402ExactPermit2ProxyABI,
    functionName: "settle",
    args: buildPermit2SettleArgs(permit2Payload),
  });
}

/**
 * Simulates settleWithPermit() via eth_call (readContract).
 * The contract atomically calls token.permit() then PERMIT2.permitTransferFrom(),
 * so simulation covers allowance + balance + nonces.
 *
 * @param signer - EVM signer for contract reads
 * @param permit2Payload - Permit2 payload with authorization and signature
 * @param eip2612Info - EIP-2612 gas sponsoring info from the payload extension
 * @returns true if simulation succeeded, false if it failed
 */
export async function simulatePermit2SettleWithPermit(
  signer: FacilitatorEvmSigner,
  permit2Payload: ExactPermit2Payload,
  eip2612Info: Eip2612GasSponsoringInfo,
): Promise<boolean> {
  try {
    const { v, r, s } = splitEip2612Signature(eip2612Info.signature);

    await signer.readContract({
      address: x402ExactPermit2ProxyAddress,
      abi: x402ExactPermit2ProxyABI,
      functionName: "settleWithPermit",
      args: [
        {
          value: BigInt(eip2612Info.amount),
          deadline: BigInt(eip2612Info.deadline),
          r,
          s,
          v,
        },
        ...buildPermit2SettleArgs(permit2Payload),
      ],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Diagnoses a Permit2 simulation failure by performing a multicall to check the proxy deployment, balance and allowance.
 *
 * @param signer - EVM signer for contract reads
 * @param tokenAddress - ERC-20 token contract address
 * @param permit2Payload - The Permit2 authorization payload
 * @param amountRequired - Required payment amount (as string)
 * @returns VerifyResponse with the most specific failure reason
 */
export async function diagnosePermit2SimulationFailure(
  signer: FacilitatorEvmSigner,
  tokenAddress: `0x${string}`,
  permit2Payload: ExactPermit2Payload,
  amountRequired: string,
): Promise<VerifyResponse> {
  const payer = permit2Payload.permit2Authorization.from;

  const diagnosticCalls: ContractCall[] = [
    {
      address: x402ExactPermit2ProxyAddress,
      abi: x402ExactPermit2ProxyABI,
      functionName: "PERMIT2",
    },
    {
      address: tokenAddress,
      abi: eip3009ABI,
      functionName: "balanceOf",
      args: [payer],
    },
    {
      address: tokenAddress,
      abi: erc20AllowanceAbi,
      functionName: "allowance",
      args: [payer, PERMIT2_ADDRESS],
    },
  ];

  try {
    const results = await multicall(signer.readContract.bind(signer), diagnosticCalls);

    const [proxyResult, balanceResult, allowanceResult] = results;

    if (proxyResult.status === "failure") {
      return { isValid: false, invalidReason: Errors.ErrPermit2ProxyNotDeployed, payer };
    }

    if (balanceResult.status === "success") {
      const balance = balanceResult.result as bigint;
      if (balance < BigInt(amountRequired)) {
        return { isValid: false, invalidReason: Errors.ErrPermit2InsufficientBalance, payer };
      }
    }

    if (allowanceResult.status === "success") {
      const allowance = allowanceResult.result as bigint;
      if (allowance < BigInt(amountRequired)) {
        return { isValid: false, invalidReason: Errors.ErrPermit2AllowanceRequired, payer };
      }
    }
  } catch {
    // Diagnostic multicall itself failed — fall through to generic error
  }

  return { isValid: false, invalidReason: Errors.ErrPermit2SimulationFailed, payer };
}

/**
 * Targeted multicall for the ERC-20 approval path where simulation cannot be used
 * (the approval hasn't been broadcast yet, so settle() would fail for expected reasons).
 * Checks proxy deployment, payer token balance and payer ETH balance for gas.
 *
 * @param signer - EVM signer for contract reads
 * @param tokenAddress - ERC-20 token contract address
 * @param payer - The payer address
 * @param amountRequired - Required payment amount (as string)
 * @returns VerifyResponse — valid if checks pass, otherwise the most specific failure
 */
export async function checkPermit2Prerequisites(
  signer: FacilitatorEvmSigner,
  tokenAddress: `0x${string}`,
  payer: `0x${string}`,
  amountRequired: string,
): Promise<VerifyResponse> {
  const diagnosticCalls: ContractCall[] = [
    {
      address: x402ExactPermit2ProxyAddress,
      abi: x402ExactPermit2ProxyABI,
      functionName: "PERMIT2",
    },
    {
      address: tokenAddress,
      abi: eip3009ABI,
      functionName: "balanceOf",
      args: [payer],
    },
    {
      address: MULTICALL3_ADDRESS,
      abi: multicall3GetEthBalanceAbi,
      functionName: "getEthBalance",
      args: [payer],
    },
  ];

  try {
    const results = await multicall(signer.readContract.bind(signer), diagnosticCalls);

    const [proxyResult, balanceResult, ethBalanceResult] = results;

    if (proxyResult.status === "failure") {
      return { isValid: false, invalidReason: Errors.ErrPermit2ProxyNotDeployed, payer };
    }

    if (balanceResult.status === "success") {
      const balance = balanceResult.result as bigint;
      if (balance < BigInt(amountRequired)) {
        return { isValid: false, invalidReason: Errors.ErrPermit2InsufficientBalance, payer };
      }
    }

    if (ethBalanceResult.status === "success") {
      const minEthForApprovalGas = ERC20_APPROVE_GAS_LIMIT * DEFAULT_MAX_FEE_PER_GAS;
      const ethBalance = ethBalanceResult.result as bigint;
      if (ethBalance < minEthForApprovalGas) {
        return {
          isValid: false,
          invalidReason: Errors.ErrErc20ApprovalInsufficientEthForGas,
          payer,
        };
      }
    }
  } catch {
    // Multicall failed — fall through to valid (fail open for prerequisites-only check)
  }

  return { isValid: true, invalidReason: undefined, payer };
}

/**
 * Delegates the full approve+settle simulation flow to the extension signer via simulateTransactions.
 * The signer owns execution strategy.
 *
 * @param extensionSigner - The extension signer with simulateTransactions capability
 * @param permit2Payload - The Permit2 specific payload
 * @param erc20Info - Object containing the signed approval transaction
 * @param erc20Info.signedTransaction - The RLP-encoded signed ERC-20 approve transaction
 * @returns true if the bundle simulation succeeded, false otherwise
 */
export async function simulatePermit2SettleWithErc20Approval(
  extensionSigner: Erc20ApprovalGasSponsoringSigner,
  permit2Payload: ExactPermit2Payload,
  erc20Info: { signedTransaction: string },
): Promise<boolean> {
  if (!extensionSigner.simulateTransactions) {
    return false;
  }

  try {
    const settleData = encodePermit2SettleCalldata(permit2Payload);

    return await extensionSigner.simulateTransactions([
      erc20Info.signedTransaction as `0x${string}`,
      { to: x402ExactPermit2ProxyAddress, data: settleData, gas: BigInt(300_000) },
    ]);
  } catch {
    return false;
  }
}

/**
 * Waits for tx receipt and returns the appropriate SettleResponse.
 *
 * @param signer - Signer with waitForTransactionReceipt capability
 * @param tx - The transaction hash to wait for
 * @param payload - The payment payload (for network info)
 * @param payer - The payer address
 * @returns Promise resolving to settlement response
 */
export async function waitAndReturn(
  signer: Pick<FacilitatorEvmSigner, "waitForTransactionReceipt">,
  tx: `0x${string}`,
  payload: PaymentPayload,
  payer: `0x${string}`,
): Promise<SettleResponse> {
  const receipt = await signer.waitForTransactionReceipt({ hash: tx });

  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: Errors.ErrInvalidTransactionState,
      transaction: tx,
      network: payload.accepted.network,
      payer,
    };
  }

  return {
    success: true,
    transaction: tx,
    network: payload.accepted.network,
    payer,
  };
}

/**
 * Maps contract revert errors to structured SettleResponse error reasons.
 *
 * @param error - The caught error
 * @param payload - The payment payload (for network info)
 * @param payer - The payer address
 * @returns A failed SettleResponse with mapped error reason
 */
export function mapSettleError(
  error: unknown,
  payload: PaymentPayload,
  payer: `0x${string}`,
): SettleResponse {
  let errorReason = Errors.ErrTransactionFailed;
  if (error instanceof Error) {
    const message = error.message;
    if (message.includes("Permit2612AmountMismatch")) {
      errorReason = Errors.ErrPermit2612AmountMismatch;
    } else if (message.includes("InvalidAmount")) {
      errorReason = Errors.ErrPermit2InvalidAmount;
    } else if (message.includes("InvalidDestination")) {
      errorReason = Errors.ErrPermit2InvalidDestination;
    } else if (message.includes("InvalidOwner")) {
      errorReason = Errors.ErrPermit2InvalidOwner;
    } else if (message.includes("PaymentTooEarly")) {
      errorReason = Errors.ErrPermit2PaymentTooEarly;
    } else if (message.includes("InvalidSignature") || message.includes("SignatureExpired")) {
      errorReason = Errors.ErrPermit2InvalidSignature;
    } else if (message.includes("InvalidNonce")) {
      errorReason = Errors.ErrPermit2InvalidNonce;
    } else if (message.includes("erc20_approval_tx_failed")) {
      errorReason = Errors.ErrErc20ApprovalTxFailed;
    } else {
      errorReason = `${Errors.ErrTransactionFailed}: ${message.slice(0, 500)}`;
    }
  }
  return {
    success: false,
    errorReason,
    transaction: "",
    network: payload.accepted.network,
    payer,
  };
}

/**
 * Validates EIP-2612 permit extension data for a Permit2 payment.
 *
 * @param info - The EIP-2612 gas sponsoring info
 * @param payer - The expected payer address
 * @param tokenAddress - The expected token address
 * @returns Validation result with optional invalidReason
 */
export function validateEip2612PermitForPayment(
  info: Eip2612GasSponsoringInfo,
  payer: `0x${string}`,
  tokenAddress: `0x${string}`,
): { isValid: boolean; invalidReason?: string } {
  if (!validateEip2612GasSponsoringInfo(info)) {
    return { isValid: false, invalidReason: Errors.ErrInvalidEip2612ExtensionFormat };
  }

  if (getAddress(info.from as `0x${string}`) !== getAddress(payer)) {
    return { isValid: false, invalidReason: Errors.ErrEip2612FromMismatch };
  }

  if (getAddress(info.asset as `0x${string}`) !== tokenAddress) {
    return { isValid: false, invalidReason: Errors.ErrEip2612AssetMismatch };
  }

  if (getAddress(info.spender as `0x${string}`) !== getAddress(PERMIT2_ADDRESS)) {
    return { isValid: false, invalidReason: Errors.ErrEip2612SpenderNotPermit2 };
  }

  const now = Math.floor(Date.now() / 1000);
  if (BigInt(info.deadline) < BigInt(now + 6)) {
    return { isValid: false, invalidReason: Errors.ErrEip2612DeadlineExpired };
  }

  return { isValid: true };
}
