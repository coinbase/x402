export { X402Paywall } from "./x402-paywall";

// Also export all component utility functions
export * from "./properties";
export * from "./events";
export * from "./templates";
export * from "./styles";

// Initialize component if in browser context
if (typeof window !== "undefined") {
  // Only define the custom element if it hasn't been defined already
  if (!customElements.get("x402-paywall")) {
    import("./x402-paywall").then(({ X402Paywall }) => {
      customElements.define("x402-paywall", X402Paywall);
    });
  }
}
