import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import type { X402Permit2Proxy } from "../dist-hardhat/typechain-types";
import {
  PERMIT2_ADDRESS,
  DETERMINISTIC_DEPLOYER,
  X402_PROXY_DEPLOYMENT_SALT,
  CHAIN_ID_TO_NAME,
  EXPLORER_URLS,
} from "./constants";

interface DeploymentInfo {
  network: string;
  chainId: string;
  x402Permit2Proxy: string;
  permit2: string;
  witnessTypeString: string;
  witnessTypehash: string;
  deployedAt: string;
  deployer: string;
  salt: string;
  deterministicDeployer: string;
}

/**
 * Compute the CREATE2 address for a contract deployment
 */
function computeCreate2Address(
  deployerAddress: string,
  salt: string,
  initCodeHash: string,
): string {
  return ethers.getCreate2Address(deployerAddress, salt, initCodeHash);
}

/**
 * Deploy contract using CREATE2 for deterministic address
 */
async function deployWithCreate2(
  signer: ethers.Signer,
  initCode: string,
  salt: string,
): Promise<string> {
  // The deterministic deployer expects: salt (32 bytes) + initCode
  const deploymentData = ethers.concat([salt, initCode]);

  // Estimate gas first to catch issues early
  const gasEstimate = await signer.estimateGas({
    to: DETERMINISTIC_DEPLOYER,
    data: deploymentData,
  });
  console.log(`   Gas estimate: ${gasEstimate.toString()}`);

  const tx = await signer.sendTransaction({
    to: DETERMINISTIC_DEPLOYER,
    data: deploymentData,
    gasLimit: (gasEstimate * 120n) / 100n, // 20% buffer
  });

  console.log(`   Tx hash: ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("CREATE2 deployment transaction failed");
  }
  console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

  // Compute the deployed address
  const initCodeHash = ethers.keccak256(initCode);
  const deployedAddress = computeCreate2Address(
    DETERMINISTIC_DEPLOYER,
    salt,
    initCodeHash,
  );

  // Wait a moment for RPC to sync (avoids false negatives on bytecode check)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Verify bytecode was actually deployed (with retry)
  let deployedCode = await signer.provider!.getCode(deployedAddress);
  if (deployedCode === "0x") {
    // Retry once after a longer delay
    console.log(`   Waiting for RPC to sync...`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    deployedCode = await signer.provider!.getCode(deployedAddress);
  }
  if (deployedCode === "0x") {
    throw new Error(
      `CREATE2 transaction succeeded but no bytecode at ${deployedAddress}. ` +
        `This usually means the constructor reverted. Check the tx: ${tx.hash}`,
    );
  }

  return deployedAddress;
}

async function main(): Promise<string> {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId.toString();
  const networkName = CHAIN_ID_TO_NAME[chainId] || network.name;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  x402Permit2Proxy Deterministic Deployment (CREATE2)`);
  console.log(`${"═".repeat(60)}\n`);

  console.log(`📡 Network: ${networkName} (chainId: ${chainId})`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`🔑 Salt: ${X402_PROXY_DEPLOYMENT_SALT}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error("Deployer has no ETH for gas. Please fund the account.");
  }

  // Verify Permit2 exists on this network
  console.log(`\n🔍 Verifying Permit2 at ${PERMIT2_ADDRESS}...`);
  const permit2Code = await ethers.provider.getCode(PERMIT2_ADDRESS);

  if (
    permit2Code === "0x" &&
    networkName !== "hardhat" &&
    networkName !== "localhost"
  ) {
    throw new Error(
      `Permit2 contract not found at ${PERMIT2_ADDRESS} on ${networkName}. ` +
        `This should not happen as Permit2 is deployed to all EVM chains.`,
    );
  }
  console.log(`✓ Permit2 contract verified`);

  // Verify deterministic deployer exists
  console.log(
    `\n🔍 Verifying CREATE2 deployer at ${DETERMINISTIC_DEPLOYER}...`,
  );
  const deployerCode = await ethers.provider.getCode(DETERMINISTIC_DEPLOYER);

  if (
    deployerCode === "0x" &&
    networkName !== "hardhat" &&
    networkName !== "localhost"
  ) {
    throw new Error(
      `Deterministic deployer not found at ${DETERMINISTIC_DEPLOYER} on ${networkName}. ` +
        `This chain may not support deterministic deployment.`,
    );
  }
  console.log(`✓ CREATE2 deployer verified`);

  // Get contract factory and compute init code
  const proxyFactory = await ethers.getContractFactory("x402Permit2Proxy");
  const initCode = ethers.concat([
    proxyFactory.bytecode,
    proxyFactory.interface.encodeDeploy([PERMIT2_ADDRESS]),
  ]);
  const initCodeHash = ethers.keccak256(initCode);

  // Compute expected address
  const expectedAddress = computeCreate2Address(
    DETERMINISTIC_DEPLOYER,
    X402_PROXY_DEPLOYMENT_SALT,
    initCodeHash,
  );
  console.log(`\n📍 Expected address: ${expectedAddress}`);

  // Check if already deployed
  const existingCode = await ethers.provider.getCode(expectedAddress);
  if (existingCode !== "0x") {
    console.log(`\n✅ Contract already deployed at ${expectedAddress}`);
    console.log(`   Skipping deployment.`);

    // Verify it's the correct contract
    const proxy = proxyFactory.attach(
      expectedAddress,
    ) as unknown as X402Permit2Proxy;
    const permit2FromContract = await proxy.PERMIT2();
    console.log(`   ✓ PERMIT2: ${permit2FromContract}`);

    return expectedAddress;
  }

  // Deploy using CREATE2
  console.log(`\n⏳ Deploying x402Permit2Proxy via CREATE2...`);

  let proxyAddress: string;

  if (networkName === "hardhat" || networkName === "localhost") {
    // For local networks without the deterministic deployer, use regular deployment
    console.log(`   (Using regular deployment for local network)`);
    const proxy = (await proxyFactory.deploy(
      PERMIT2_ADDRESS,
    )) as unknown as X402Permit2Proxy;
    await proxy.waitForDeployment();
    proxyAddress = await proxy.getAddress();
  } else {
    // Use CREATE2 for deterministic deployment
    proxyAddress = await deployWithCreate2(
      deployer,
      initCode,
      X402_PROXY_DEPLOYMENT_SALT,
    );
  }

  console.log(`✅ Deployed to: ${proxyAddress}`);

  // Verify the address matches expected (for CREATE2 deployments)
  if (networkName !== "hardhat" && networkName !== "localhost") {
    if (proxyAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error(
        `Address mismatch! Expected ${expectedAddress}, got ${proxyAddress}. ` +
          `This indicates a problem with the CREATE2 deployment.`,
      );
    }
    console.log(`✓ Address matches expected CREATE2 address`);
  }

  // Verify deployment by reading contract state
  console.log(`\n🔍 Verifying deployment...`);

  const proxy = proxyFactory.attach(
    proxyAddress,
  ) as unknown as X402Permit2Proxy;
  const permit2FromContract = await proxy.PERMIT2();
  if (permit2FromContract.toLowerCase() !== PERMIT2_ADDRESS.toLowerCase()) {
    throw new Error(
      `Permit2 address mismatch! Expected ${PERMIT2_ADDRESS}, got ${permit2FromContract}`,
    );
  }
  console.log(`✓ PERMIT2: ${permit2FromContract}`);

  const witnessTypeString = await proxy.WITNESS_TYPE_STRING();
  console.log(
    `✓ WITNESS_TYPE_STRING: ${witnessTypeString.substring(0, 60)}...`,
  );

  const witnessTypehash = await proxy.WITNESS_TYPEHASH();
  console.log(`✓ WITNESS_TYPEHASH: ${witnessTypehash}`);

  // Create deployment info
  const deploymentInfo: DeploymentInfo = {
    network: networkName,
    chainId: chainId,
    x402Permit2Proxy: proxyAddress,
    permit2: PERMIT2_ADDRESS,
    witnessTypeString: witnessTypeString,
    witnessTypehash: witnessTypehash,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    salt: X402_PROXY_DEPLOYMENT_SALT,
    deterministicDeployer: DETERMINISTIC_DEPLOYER,
  };

  // Save deployment info to file
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, `${networkName}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n💾 Deployment info saved to: ${deploymentFile}`);

  // Print summary
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Deployment Summary`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  Network:           ${networkName} (${chainId})`);
  console.log(`  x402Permit2Proxy:  ${proxyAddress}`);
  console.log(`  Permit2:           ${PERMIT2_ADDRESS}`);
  console.log(
    `  Salt:              ${X402_PROXY_DEPLOYMENT_SALT.substring(0, 20)}...`,
  );
  console.log(`  Deployer:          ${deployer.address}`);
  console.log(`${"─".repeat(60)}`);

  // Print explorer link and verification command
  const explorerUrl = EXPLORER_URLS[networkName];
  if (explorerUrl) {
    console.log(`\n🔗 View on Block Explorer:`);
    console.log(`   ${explorerUrl}/address/${proxyAddress}`);
  }

  if (networkName !== "hardhat" && networkName !== "localhost") {
    console.log(`\n🔐 To verify on block explorer, run:`);
    console.log(
      `   pnpm verify:${networkName} ${proxyAddress} ${PERMIT2_ADDRESS}`,
    );
    console.log(`\n   Or manually:`);
    console.log(
      `   npx hardhat verify --network ${networkName} ${proxyAddress} "${PERMIT2_ADDRESS}"`,
    );
  }

  console.log(`\n✨ Deployment complete!\n`);

  return proxyAddress;
}

// Run deployment
main()
  .then((address) => {
    console.log(`Deployed contract address: ${address}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Deployment failed:\n`);
    console.error(error);
    process.exit(1);
  });
