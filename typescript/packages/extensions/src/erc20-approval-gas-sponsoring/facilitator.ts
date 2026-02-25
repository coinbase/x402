/**
 * Facilitator functions for extracting and validating ERC-20 Approval Gas Sponsoring
 * extension data.
 *
 * These functions help facilitators extract the pre-signed approve() transaction
 * from payment payloads and validate it before broadcasting and settling.
 */

import type { PaymentPayload } from "@x402/core/types";
import {
  ERC20_APPROVAL_GAS_SPONSORING,
  type Erc20ApprovalGasSponsoringInfo,
  type Erc20ApprovalGasSponsoringExtension,
} from "./types";

/**
 * Extracts the ERC-20 approval gas sponsoring info from a payment payload's extensions.
 *
 * Returns the info if the extension is present and contains the required client-populated
 * fields (from, asset, spender, amount, signedTransaction, version).
 *
 * @param paymentPayload - The payment payload to extract from
 * @returns The ERC-20 approval gas sponsoring info, or null if not present
 */
export function extractErc20ApprovalGasSponsoringInfo(
  paymentPayload: PaymentPayload,
): Erc20ApprovalGasSponsoringInfo | null {
  if (!paymentPayload.extensions) {
    return null;
  }

  const extension = paymentPayload.extensions[ERC20_APPROVAL_GAS_SPONSORING.key] as
    | Erc20ApprovalGasSponsoringExtension
    | undefined;

  if (!extension?.info) {
    return null;
  }

  const info = extension.info as Record<string, unknown>;

  // Check that the client has populated the required fields
  if (
    !info.from ||
    !info.asset ||
    !info.spender ||
    !info.amount ||
    !info.signedTransaction ||
    !info.version
  ) {
    return null;
  }

  return info as unknown as Erc20ApprovalGasSponsoringInfo;
}

/**
 * Validates that the ERC-20 approval gas sponsoring info has valid format.
 *
 * Performs basic validation on the info fields:
 * - Addresses are valid hex (0x + 40 hex chars)
 * - Amount is a numeric string
 * - signedTransaction is a hex string
 * - Version is a numeric version string
 *
 * @param info - The ERC-20 approval gas sponsoring info to validate
 * @returns True if the info is valid, false otherwise
 */
export function validateErc20ApprovalGasSponsoringInfo(
  info: Erc20ApprovalGasSponsoringInfo,
): boolean {
  const addressPattern = /^0x[a-fA-F0-9]{40}$/;
  const numericPattern = /^[0-9]+$/;
  const hexPattern = /^0x[a-fA-F0-9]+$/;
  const versionPattern = /^[0-9]+(\.[0-9]+)*$/;

  return (
    addressPattern.test(info.from) &&
    addressPattern.test(info.asset) &&
    addressPattern.test(info.spender) &&
    numericPattern.test(info.amount) &&
    hexPattern.test(info.signedTransaction) &&
    versionPattern.test(info.version)
  );
}
