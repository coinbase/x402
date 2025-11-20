import { Address } from "viem";
import { paymentMiddleware, Network } from "x402-next";

const facilitatorUrl = process.env.FACILITATOR_URL as `${string}://${string}`;
const payTo = process.env.EVM_ADDRESS as Address;
const network = process.env.EVM_NETWORK as Network;

// Configure facilitator
const facilitatorConfig = facilitatorUrl
  ? {
      url: facilitatorUrl,
    }
  : undefined;

export const middleware = paymentMiddleware(
  payTo,
  {
    "/api/protected": {
      price: "$0.001",
      network,
      config: {
        description: "Protected API endpoint",
      },
    },
  },
  facilitatorConfig,
  {
    appName: "Next x402 E2E Test",
    appLogo: "/x402-icon-blue.png",
  },
);

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/api/protected"],
  runtime: "nodejs", // TEMPORARY: Only needed until Edge runtime support is added
};
