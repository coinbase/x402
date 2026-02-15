// Shared extension utilities
export { WithExtensions } from "./types";

// Bazaar extension
export * from "./bazaar";
export { bazaarResourceServerExtension } from "./bazaar/server";

// Sign-in-with-x extension
export * from "./sign-in-with-x";

// Payment-identifier extension
export * from "./payment-identifier";
export { paymentIdentifierResourceServerExtension } from "./payment-identifier/resourceServer";

// ERC-8004 Reputation extension
export * from "./8004-reputation";
export { reputationResourceServerExtension } from "./8004-reputation/server";
