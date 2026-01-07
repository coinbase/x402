/**
 * Compute the deterministic CREATE2 address for x402Permit2Proxy
 *
 * This script computes the address without deploying, useful for:
 * - Verifying the address matches on all chains before deployment
 * - Pre-computing the address for configuration
 * - Debugging deployment issues
 *
 * Usage: npx hardhat run scripts/compute-address.ts
 */

import { ethers } from "hardhat";
import {
  PERMIT2_ADDRESS,
  DETERMINISTIC_DEPLOYER,
  X402_PROXY_DEPLOYMENT_SALT,
} from "./constants";

async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  x402Permit2Proxy Address Computation`);
  console.log(`${"═".repeat(60)}\n`);

  // Get contract factory
  const proxyFactory = await ethers.getContractFactory("x402Permit2Proxy");

  // Compute init code (bytecode + constructor args)
  const initCode = ethers.concat([
    proxyFactory.bytecode,
    proxyFactory.interface.encodeDeploy([PERMIT2_ADDRESS]),
  ]);

  const initCodeHash = ethers.keccak256(initCode);

  // Compute CREATE2 address
  const expectedAddress = ethers.getCreate2Address(
    DETERMINISTIC_DEPLOYER,
    X402_PROXY_DEPLOYMENT_SALT,
    initCodeHash,
  );

  console.log(`📋 Configuration:`);
  console.log(`   Permit2 Address:      ${PERMIT2_ADDRESS}`);
  console.log(`   CREATE2 Deployer:     ${DETERMINISTIC_DEPLOYER}`);
  console.log(`   Deployment Salt:      ${X402_PROXY_DEPLOYMENT_SALT}`);
  console.log(`   Init Code Hash:       ${initCodeHash}`);
  console.log();
  console.log(`${"─".repeat(60)}`);
  console.log(`   x402Permit2Proxy Address (all chains):`);
  console.log(`   ${expectedAddress}`);
  console.log(`${"─".repeat(60)}`);

  // Check if already deployed on current network
  const network = await ethers.provider.getNetwork();
  const existingCode = await ethers.provider.getCode(expectedAddress);

  console.log();
  console.log(
    `📡 Current network: ${network.name} (chainId: ${network.chainId})`,
  );
  if (existingCode !== "0x") {
    console.log(`✅ Contract is deployed on this network`);

    // Verify it's the correct contract
    const proxy = proxyFactory.attach(expectedAddress);
    try {
      const permit2 = await proxy.PERMIT2();
      console.log(`   PERMIT2: ${permit2}`);
    } catch {
      console.log(`⚠️  Contract exists but may not be x402Permit2Proxy`);
    }
  } else {
    console.log(`❌ Contract is NOT deployed on this network`);
  }

  console.log();
  return expectedAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
