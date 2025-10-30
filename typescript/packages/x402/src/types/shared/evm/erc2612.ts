/**
 * ERC-2612 Permit Type Definitions
 *
 * ERC-2612 extends ERC-20 with gasless approvals via signed messages.
 * Unlike EIP-3009 (transferWithAuthorization), ERC-2612 only approves a spender
 * to transfer tokens, requiring a separate transfer transaction.
 */

export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export const permitPrimaryType = "Permit";
