import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// Load environment variables
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

// Validate required env vars for live deployments
if (process.argv.includes("--network") && process.argv.includes("base-sepolia")) {
  if (!PRIVATE_KEY) {
    console.warn("⚠️  Warning: PRIVATE_KEY not set. Deployment will fail.");
  }
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./dist-hardhat/cache",
    artifacts: "./dist-hardhat/artifacts",
  },
  networks: {
    hardhat: {
      // Use Base Sepolia's chainId when forking to match Permit2's domain separator
      chainId: process.env.FORK_BASE_SEPOLIA === "true" ? 84532 : 1337,
      // Forking can be enabled via environment variable
      forking: process.env.FORK_BASE_SEPOLIA === "true"
        ? {
            url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
            // Optional: pin to a specific block for deterministic tests
            // blockNumber: 12345678,
          }
        : undefined,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    "base-sepolia": {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
    // Additional networks
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      chainId: 11155111,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  etherscan: {
    // Etherscan V2 API - single key works across all chains
    apiKey: BASESCAN_API_KEY,
  },
  sourcify: {
    enabled: false, // Disable sourcify info message
  },
  typechain: {
    outDir: "dist-hardhat/typechain-types",
    target: "ethers-v6",
  },
};

export default config;
