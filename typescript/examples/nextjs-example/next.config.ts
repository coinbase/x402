import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@x402/core",
    "@x402/evm",
    "@x402-observed/core",
    "@x402-observed/next",
  ],
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
