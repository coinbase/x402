import { ethers } from "hardhat";
import { PERMIT2_ADDRESS } from "../src/constants";
import { DETERMINISTIC_DEPLOYER } from "./constants";

/**
 * Mine for a vanity CREATE2 address for any x402 contract.
 *
 * Usage (via environment variables):
 *   CONTRACT=x402Permit2Proxy PATTERN=402 pnpm mine-vanity
 *   CONTRACT=x402Permit2Proxy PATTERN=4020 MAX=50000000 pnpm mine-vanity
 *   CONTRACT=MyContract PATTERN=abc ARGS="0x123...,42" pnpm mine-vanity
 *
 * Environment Variables:
 *   CONTRACT      - Name of the contract (must match a compiled contract)
 *   PATTERN       - Hex pattern address must START with (after 0x)
 *   ARGS          - Optional comma-separated constructor arguments
 *   MAX           - Maximum attempts (default: 10,000,000)
 *   CONTAINS      - Set to "true" to match pattern anywhere (default: prefix only)
 */

interface Config {
  contractName: string;
  pattern: string;
  constructorArgs: unknown[];
  maxAttempts: number;
  allowContains: boolean; // false = prefix only (default), true = match anywhere
}

// Known x402 contracts and their default constructor args
const KNOWN_CONTRACTS: Record<string, () => unknown[]> = {
  x402Permit2Proxy: () => [PERMIT2_ADDRESS],
  // Add more x402 contracts here as they're created:
  // x402TokenGateway: () => [SOME_ADDRESS],
  // x402PaymentRouter: () => [PERMIT2_ADDRESS, FEE_RECIPIENT],
};

function parseArgs(): Config {
  const contractName = process.env.CONTRACT;
  const pattern = process.env.PATTERN;

  if (!contractName || !pattern) {
    console.log(`
Usage: CONTRACT=<name> PATTERN=<pattern> pnpm mine-vanity

Environment Variables:
  CONTRACT        Name of the compiled contract (e.g., x402Permit2Proxy)
  PATTERN         Hex pattern address must START with (e.g., 402, 4020)
  ARGS            Comma-separated constructor arguments (optional)
  MAX             Maximum attempts (default: 10,000,000)
  CONTAINS        Set to "true" to match pattern anywhere (default: prefix only)

Examples:
  CONTRACT=x402Permit2Proxy PATTERN=402 pnpm mine-vanity
  CONTRACT=x402Permit2Proxy PATTERN=4020 MAX=50000000 pnpm mine-vanity
  CONTRACT=x402Permit2Proxy PATTERN=402 CONTAINS=true pnpm mine-vanity
`);
    process.exit(1);
  }

  // Parse optional env vars
  let constructorArgs: unknown[] = [];
  const maxAttempts = parseInt(process.env.MAX || "10000000", 10);
  const allowContains = process.env.CONTAINS === "true";

  if (process.env.ARGS) {
    constructorArgs = process.env.ARGS.split(",").map((arg) => {
      const trimmed = arg.trim();
      // Try to parse as number or boolean
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
      if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
      return trimmed;
    });
  }

  // Use known contract defaults if no args provided
  if (constructorArgs.length === 0 && KNOWN_CONTRACTS[contractName]) {
    constructorArgs = KNOWN_CONTRACTS[contractName]();
  }

  return { contractName, pattern, constructorArgs, maxAttempts, allowContains };
}

function computeCreate2Address(
  deployerAddress: string,
  salt: string,
  initCodeHash: string,
): string {
  return ethers.getCreate2Address(deployerAddress, salt, initCodeHash);
}

function matchesPattern(
  address: string,
  pattern: string,
  allowContains: boolean,
): boolean {
  const lowerAddress = address.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  // Check if it's a prefix match (starts with 0x + pattern)
  if (lowerAddress.startsWith("0x" + lowerPattern)) {
    return true;
  }

  // Check if pattern appears anywhere in the address (only if allowContains)
  if (allowContains && lowerAddress.includes(lowerPattern)) {
    return true;
  }

  return false;
}

async function main() {
  const config = parseArgs();
  const LOG_INTERVAL = 100_000;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  x402 Vanity Address Miner`);
  console.log(`${"═".repeat(60)}\n`);

  console.log(`📦 Contract:     ${config.contractName}`);
  console.log(
    `🎯 Pattern:      "${config.pattern}" (${config.allowContains ? "contains anywhere" : "prefix only"})`,
  );
  console.log(
    `🔧 Constructor:  [${config.constructorArgs.map(String).join(", ")}]`,
  );
  console.log(`🔧 Deployer:     ${DETERMINISTIC_DEPLOYER}`);
  console.log(`⏱️  Max attempts: ${config.maxAttempts.toLocaleString()}\n`);

  // Get contract factory
  let proxyFactory;
  try {
    proxyFactory = await ethers.getContractFactory(config.contractName);
  } catch (error) {
    console.error(`❌ Contract "${config.contractName}" not found.`);
    console.error(`   Make sure it's compiled: pnpm build:contracts`);
    console.error(`   Available contracts are in contracts/ directory.`);
    process.exit(1);
  }

  // Compute init code
  const initCode = ethers.concat([
    proxyFactory.bytecode,
    proxyFactory.interface.encodeDeploy(config.constructorArgs),
  ]);
  const initCodeHash = ethers.keccak256(initCode);

  console.log(`📦 Init code hash: ${initCodeHash}\n`);
  console.log(`🔍 Mining for vanity address...\n`);

  const startTime = Date.now();
  let found = false;
  let bestMatch = { salt: "", address: "", matchPos: Infinity, saltBase: "" };

  for (let i = 0; i < config.maxAttempts; i++) {
    // Generate a salt based on contract name + counter
    const saltBase = `x402-${config.contractName.toLowerCase()}-v${i}`;
    const salt = ethers.keccak256(ethers.toUtf8Bytes(saltBase));

    const address = computeCreate2Address(
      DETERMINISTIC_DEPLOYER,
      salt,
      initCodeHash,
    );

    // Check for match
    if (matchesPattern(address, config.pattern, config.allowContains)) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n${"─".repeat(60)}`);
      console.log(`  ✅ FOUND MATCH!`);
      console.log(`${"─".repeat(60)}`);
      console.log(`  Contract:     ${config.contractName}`);
      console.log(`  Salt base:    "${saltBase}"`);
      console.log(`  Salt (hex):   ${salt}`);
      console.log(`  Address:      ${address}`);
      console.log(`  Attempts:     ${(i + 1).toLocaleString()}`);
      console.log(`  Time:         ${elapsed}s`);
      console.log(`${"─".repeat(60)}\n`);

      console.log(`📋 To use this salt, add to scripts/constants.ts:`);
      console.log(
        `\n   // Salt for ${config.contractName} vanity address: ${address}`,
      );
      console.log(
        `   export const ${toConstantCase(config.contractName)}_SALT = "${salt}" as const;`,
      );
      console.log(`   // Derived from: "${saltBase}"\n`);

      found = true;
      break;
    }

    // Track best partial match (closest to start)
    const lowerAddr = address.toLowerCase();
    const lowerPattern = config.pattern.toLowerCase();
    const matchPos = lowerAddr.indexOf(lowerPattern);
    if (matchPos !== -1 && matchPos < bestMatch.matchPos) {
      bestMatch = { salt, address, matchPos, saltBase };
    }

    // Progress logging
    if ((i + 1) % LOG_INTERVAL === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const rate = Math.floor(((i + 1) / (Date.now() - startTime)) * 1000);
      console.log(
        `   Checked ${(i + 1).toLocaleString()} salts (${rate}/s, ${elapsed}s elapsed)`,
      );
      if (bestMatch.matchPos !== Infinity) {
        console.log(
          `   Best so far: ${bestMatch.address} (pattern at position ${bestMatch.matchPos})`,
        );
      }
    }
  }

  if (!found) {
    console.log(
      `\n❌ No exact match found after ${config.maxAttempts.toLocaleString()} attempts.`,
    );
    if (bestMatch.matchPos !== Infinity) {
      console.log(`\n📌 Best partial match found:`);
      console.log(`   Address:   ${bestMatch.address}`);
      console.log(`   Salt:      ${bestMatch.salt}`);
      console.log(`   Salt base: "${bestMatch.saltBase}"`);
      console.log(
        `   Pattern "${config.pattern}" at position ${bestMatch.matchPos}`,
      );
    }
    console.log(`\n💡 Tips:`);
    console.log(`   - Try a shorter pattern (e.g., "402" instead of "4020")`);
    console.log(`   - Each additional character is ~16x harder to find`);
    console.log(`   - Increase --max for longer searches`);
    console.log(`   - "402" typically finds in <10k attempts`);
    console.log(`   - "4020" may need 100k+ attempts`);
  }
}

function toConstantCase(str: string): string {
  // x402Permit2Proxy -> X402_PERMIT2_PROXY
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
