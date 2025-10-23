import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    nodeMiddleware: true, // TEMPORARY: Only needed until Edge runtime support is added
  },
  serverExternalPackages: ["@coinbase/cdp-sdk"],
  env: {
    ADDRESS: process.env.ADDRESS,
    USE_CDP_FACILITATOR: process.env.USE_CDP_FACILITATOR,
    CDP_API_KEY_ID: process.env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: process.env.CDP_API_KEY_SECRET,
    NETWORK: process.env.NETWORK,
    PORT: process.env.PORT,
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });

    // Handle Node.js modules that might not be compatible with Edge Runtime
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: require.resolve("crypto-browserify"),
      stream: require.resolve("stream-browserify"),
      buffer: require.resolve("buffer"),
    };

    return config;
  },
};

export default nextConfig;
