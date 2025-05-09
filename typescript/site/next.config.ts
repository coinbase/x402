import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    RESOURCE_WALLET_ADDRESS: process.env.RESOURCE_WALLET_ADDRESS,
    NEXT_PUBLIC_FACILITATOR_URL: process.env.NEXT_PUBLIC_FACILITATOR_URL,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    NETWORK: process.env.NETWORK,
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });

    // https://github.com/webpack/webpack/issues/14798
    config.externals.push({
      "node:crypto": "commonjs crypto",
    });

    return config;
  },
};

export default nextConfig;
