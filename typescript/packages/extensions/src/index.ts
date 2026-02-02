// Shared extension utilities
export { WithExtensions } from "./types";

// Bazaar extension
export * from "./bazaar";
export { bazaarResourceServerExtension } from "./bazaar/server";

// Sign-in-with-x extension
export * from "./sign-in-with-x";

// 8004-Reputation extension
export * from "./reputation";
export {
  reputationServerExtension,
  createReputationServerExtension,
  declareReputationExtension,
  createAttestationEnricher,
} from "./reputation/server";
