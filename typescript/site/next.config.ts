import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    RESOURCE_WALLET_ADDRESS: process.env.RESOURCE_WALLET_ADDRESS,
    NEXT_PUBLIC_FACILITATOR_URL: process.env.NEXT_PUBLIC_FACILITATOR_URL,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    NETWORK: process.env.NETWORK,
  },
  webpack(config, { nextRuntime }) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });

    // Ignore Stellar SDK in Edge Runtime to avoid dynamic code evaluation errors
    if (nextRuntime === "edge") {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@stellar/stellar-sdk": false,
      };
    }

    return config;
  },
};

export default nextConfig;
