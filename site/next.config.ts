import type { NextConfig } from "next";

const config: NextConfig = {
  env: {
    FACILITATOR_WALLET_ADDRESS: process.env.FACILITATOR_WALLET_ADDRESS,
    NEXT_PUBLIC_FACILITATOR_URL: process.env.NEXT_PUBLIC_FACILITATOR_URL,
  },
};

export default config;
