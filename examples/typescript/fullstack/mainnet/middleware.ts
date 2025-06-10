import { facilitator } from "@coinbase/x402";
import { Address } from "viem";
import { paymentMiddleware } from "x402-next";

const payTo = process.env.RESOURCE_WALLET_ADDRESS as Address;

export const middleware = paymentMiddleware(
  payTo,
  {
    "/protected": {
      price: "$0.001",
      network: "base",
      config: {
        description: "Access to protected content",
      },
    },
  },
  facilitator,
);

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/protected/:path*"],
  runtime: "nodejs",
};
