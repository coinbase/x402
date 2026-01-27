/**
 * Constants for EIP-2612 Gas Sponsoring Extension
 */

/**
 * Extension identifier key for EIP-2612 gas sponsoring.
 * Used in PaymentRequired.extensions and PaymentPayload.extensions.
 */
export const EIP2612_GAS_SPONSORING = "eip2612GasSponsoring";

/**
 * Canonical Permit2 address (same on all EVM chains).
 * The spender in EIP-2612 permits must be this address.
 *
 * @see https://docs.uniswap.org/contracts/v4/deployments
 */
export const CANONICAL_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/**
 * Maximum uint256 value for unlimited approvals.
 */
export const MAX_UINT256 =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

/**
 * Default permit validity period (1 hour in seconds).
 */
export const DEFAULT_PERMIT_VALIDITY_SECONDS = 3600;

/**
 * Minimum time before deadline for permit to be considered valid (60 seconds).
 */
export const MIN_DEADLINE_BUFFER_SECONDS = 60;
