import { Address } from "viem";
import { createPaymentMiddleware, Network, Resource } from "x402-next";

export const middleware = createPaymentMiddleware({
  facilitatorUrl: process.env.NEXT_PUBLIC_FACILITATOR_URL as Resource,
  address: process.env.RESOURCE_WALLET_ADDRESS as Address,
  network: process.env.NETWORK as Network,
  routes: {
    "/protected": {
      amount: "$0.01",
      config: {
        description: "Access to protected content",
      },
    },
  },
});

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/protected/:path*"],
};
