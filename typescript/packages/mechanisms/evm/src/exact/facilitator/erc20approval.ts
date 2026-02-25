import { getAddress, parseTransaction, decodeFunctionData, recoverTransactionAddress } from "viem";
import {
  validateErc20ApprovalGasSponsoringInfo,
  type Erc20ApprovalGasSponsoringInfo,
} from "@x402/extensions";
import { PERMIT2_ADDRESS } from "../../constants";

/** ERC-20 approve ABI for decoding approve(address,uint256) calldata */
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

/** The approve(address,uint256) function selector */
const APPROVE_SELECTOR = "0x095ea7b3";

/**
 * Validates ERC-20 approval extension data for a Permit2 payment.
 *
 * Performs comprehensive validation:
 * - Format validation via validateErc20ApprovalGasSponsoringInfo
 * - `from` matches payer
 * - `asset` matches token
 * - `spender` is PERMIT2_ADDRESS
 * - Transaction `to` matches token address
 * - Transaction calldata is a valid approve(PERMIT2_ADDRESS, ...) call
 * - Recovered transaction signer matches `from`
 *
 * @param info - The ERC-20 approval gas sponsoring info
 * @param payer - The expected payer address
 * @param tokenAddress - The expected token address
 * @returns Validation result
 */
export async function validateErc20ApprovalForPayment(
  info: Erc20ApprovalGasSponsoringInfo,
  payer: `0x${string}`,
  tokenAddress: `0x${string}`,
): Promise<{ isValid: boolean; invalidReason?: string }> {
  // Validate format
  if (!validateErc20ApprovalGasSponsoringInfo(info)) {
    return { isValid: false, invalidReason: "invalid_erc20_approval_extension_format" };
  }

  // Verify from matches payer
  if (getAddress(info.from as `0x${string}`) !== getAddress(payer)) {
    return { isValid: false, invalidReason: "erc20_approval_from_mismatch" };
  }

  // Verify asset matches token
  if (getAddress(info.asset as `0x${string}`) !== tokenAddress) {
    return { isValid: false, invalidReason: "erc20_approval_asset_mismatch" };
  }

  // Verify spender field in info is Permit2
  if (getAddress(info.spender as `0x${string}`) !== getAddress(PERMIT2_ADDRESS)) {
    return { isValid: false, invalidReason: "erc20_approval_spender_not_permit2" };
  }

  // Parse and validate the signed transaction
  try {
    const serializedTx = info.signedTransaction as `0x${string}`;
    const tx = parseTransaction(serializedTx);

    // Verify the transaction targets the token contract
    if (!tx.to || getAddress(tx.to) !== tokenAddress) {
      return { isValid: false, invalidReason: "erc20_approval_tx_wrong_target" };
    }

    // Verify the calldata is an approve() call
    const data = tx.data ?? "0x";
    if (!data.startsWith(APPROVE_SELECTOR)) {
      return { isValid: false, invalidReason: "erc20_approval_tx_wrong_selector" };
    }

    // Decode the calldata to verify the spender argument is PERMIT2_ADDRESS
    try {
      const decoded = decodeFunctionData({
        abi: erc20ApproveAbi,
        data: data as `0x${string}`,
      });
      const calldataSpender = getAddress(decoded.args[0] as `0x${string}`);
      if (calldataSpender !== getAddress(PERMIT2_ADDRESS)) {
        return { isValid: false, invalidReason: "erc20_approval_tx_wrong_spender" };
      }
    } catch {
      return { isValid: false, invalidReason: "erc20_approval_tx_invalid_calldata" };
    }

    // Recover the signer of the transaction and verify it matches from
    try {
      const recoveredAddress = await recoverTransactionAddress({
        serializedTransaction: serializedTx,
      });
      if (getAddress(recoveredAddress) !== getAddress(payer)) {
        return { isValid: false, invalidReason: "erc20_approval_tx_signer_mismatch" };
      }
    } catch {
      return { isValid: false, invalidReason: "erc20_approval_tx_invalid_signature" };
    }
  } catch {
    return { isValid: false, invalidReason: "erc20_approval_tx_parse_failed" };
  }

  return { isValid: true };
}
