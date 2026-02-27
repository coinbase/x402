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

// EIP-2612 Gas Sponsoring extension
export * from "./eip2612-gas-sponsoring";
