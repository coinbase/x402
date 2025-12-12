import { Address } from "viem";
import { paymentMiddleware } from "x402-next";

const payTo = process.env.RESOURCE_WALLET_ADDRESS as Address;
const network = (process.env.NETWORK || "base-sepolia") as
  | "base"
  | "base-sepolia";

// Validate required environment variables
if (!payTo || payTo === "0x0000000000000000000000000000000000000000") {
  console.warn(
    "RESOURCE_WALLET_ADDRESS not set or is default value. Please set a valid wallet address.",
  );
}

export const middleware = paymentMiddleware(payTo, {
  "/api/protected": {
    price: "$0.01",
    network,
    config: {
      description: "Protected route",
    },
  },
});

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/api/protected"],
  runtime: "nodejs",
};
