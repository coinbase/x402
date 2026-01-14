/**
 * Constants for ERC-20 Approval Gas Sponsoring Extension
 */

/**
 * Extension identifier key for ERC-20 approval gas sponsoring.
 * Used in PaymentRequired.extensions and PaymentPayload.extensions.
 */
export const ERC20_APPROVAL_GAS_SPONSORING = "erc20ApprovalGasSponsoring";

/**
 * Canonical Permit2 address (same on all EVM chains).
 * The spender in approval transactions must be this address.
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
 * Minimum hex length for a valid signed EIP-1559 transaction.
 * A minimal EIP-1559 tx (type 2) is approximately 100+ bytes,
 * so we use 100 hex characters (50 bytes) as a conservative minimum.
 * This catches obviously invalid/empty transactions.
 */
export const MIN_SIGNED_TX_HEX_LENGTH = 100;
