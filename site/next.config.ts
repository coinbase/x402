import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    FACILITATOR_WALLET_ADDRESS: process.env.FACILITATOR_WALLET_ADDRESS,
    NEXT_PUBLIC_FACILITATOR_URL: process.env.NEXT_PUBLIC_FACILITATOR_URL,
  },
};

export default nextConfig;
