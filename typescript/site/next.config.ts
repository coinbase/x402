import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    RESOURCE_WALLET_ADDRESS: process.env.RESOURCE_WALLET_ADDRESS,
    NEXT_PUBLIC_FACILITATOR_URL: process.env.NEXT_PUBLIC_FACILITATOR_URL,
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
};

export default nextConfig;
