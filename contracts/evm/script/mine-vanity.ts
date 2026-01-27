import { keccak256, encodePacked, toHex, getCreate2Address, encodeAbiParameters } from "viem";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Constants
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

// Target patterns
const PREFIX_HEX = "4020"; // Address should start with 0x4020
const EXACT_SUFFIX = "01"; // x402ExactPermit2Proxy should end with 01
const UPTO_SUFFIX = "02"; // x402UptoPermit2Proxy should end with 02

// Get bytecode from compiled contracts
function getInitCodeHash(contractName: string): `0x${string}` {
  const outPath = path.join(__dirname, "..", "out", `${contractName}.sol`, `${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(outPath, "utf-8"));
  const bytecode = artifact.bytecode.object as `0x${string}`;

  // Encode constructor args (PERMIT2 address)
  const constructorArgs = encodeAbiParameters([{ type: "address" }], [PERMIT2 as `0x${string}`]);

  // Combine bytecode + constructor args
  const initCode = (bytecode + constructorArgs.slice(2)) as `0x${string}`;

  return keccak256(initCode);
}

function checkAddress(
  address: string,
  prefixHex: string,
  suffixHex: string
): { prefixMatch: number; suffixMatch: boolean } {
  const addrLower = address.toLowerCase().slice(2); // Remove 0x

  // Check prefix match (count matching hex chars)
  let prefixMatch = 0;
  for (let i = 0; i < prefixHex.length && i < addrLower.length; i++) {
    if (addrLower[i] === prefixHex[i].toLowerCase()) {
      prefixMatch++;
    } else {
      break;
    }
  }

  // Check suffix match
  const suffixMatch = addrLower.endsWith(suffixHex.toLowerCase());

  return { prefixMatch, suffixMatch };
}

function computeCreate2Address(salt: `0x${string}`, initCodeHash: `0x${string}`): `0x${string}` {
  return getCreate2Address({
    from: CREATE2_DEPLOYER as `0x${string}`,
    salt,
    bytecodeHash: initCodeHash,
  });
}

function mineVanityAddress(
  contractName: string,
  initCodeHash: `0x${string}`,
  prefixHex: string,
  suffixHex: string,
  maxAttempts: number = 100_000_000
): { salt: `0x${string}`; address: `0x${string}` } | null {
  console.log(`\nMining for ${contractName} (0x${prefixHex}...${suffixHex})`);
  console.log(`Init code hash: ${initCodeHash}`);
  console.log(`Max attempts: ${maxAttempts.toLocaleString()}`);

  let bestSalt: `0x${string}` = "0x0";
  let bestAddress: `0x${string}` = "0x0";
  let bestScore = 0;

  const startTime = Date.now();

  for (let i = 0; i < maxAttempts; i++) {
    // Generate salt from prefix + counter
    const salt = keccak256(encodePacked(["string", "uint256"], [`x402-${contractName}-v3-`, BigInt(i)]));

    const address = computeCreate2Address(salt, initCodeHash);
    const { prefixMatch, suffixMatch } = checkAddress(address, prefixHex, suffixHex);

    // Score: prefix match * 10 + suffix match bonus
    const score = prefixMatch * 10 + (suffixMatch ? 100 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestSalt = salt;
      bestAddress = address;

      console.log(`  Attempt ${i.toLocaleString()}: New best!`);
      console.log(`    Address: ${address}`);
      console.log(`    Prefix match: ${prefixMatch}/${prefixHex.length} chars`);
      console.log(`    Suffix match: ${suffixMatch}`);

      // Full match
      if (prefixMatch >= prefixHex.length && suffixMatch) {
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`\n  FOUND MATCH after ${i.toLocaleString()} attempts (${elapsed.toFixed(2)}s)!`);
        console.log(`  Salt: ${salt}`);
        console.log(`  Address: ${address}`);
        return { salt, address };
      }
    }

    if (i > 0 && i % 1_000_000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = i / elapsed;
      console.log(
        `  Progress: ${i.toLocaleString()} attempts (${rate.toFixed(0)} addr/sec, best: ${bestAddress})`
      );
    }
  }

  console.log(`\n  No exact match found after ${maxAttempts.toLocaleString()} attempts.`);
  console.log(`  Best: ${bestAddress} (salt: ${bestSalt})`);
  return null;
}

async function main() {
  console.log("============================================================");
  console.log("  x402 Vanity Address Miner (TypeScript)");
  console.log("============================================================");
  console.log(`\nTarget: 0x${PREFIX_HEX}...`);
  console.log(`  Exact suffix: ${EXACT_SUFFIX}`);
  console.log(`  Upto suffix: ${UPTO_SUFFIX}`);

  // Compile contracts first
  console.log("\nCompiling contracts...");
  execSync("forge build", { cwd: path.join(__dirname, ".."), stdio: "inherit" });

  // Get init code hashes
  const exactInitCodeHash = getInitCodeHash("x402ExactPermit2Proxy");
  const uptoInitCodeHash = getInitCodeHash("x402UptoPermit2Proxy");

  console.log("\n------------------------------------------------------------");
  console.log("  x402ExactPermit2Proxy");
  console.log("------------------------------------------------------------");
  const exactResult = mineVanityAddress("exact", exactInitCodeHash, PREFIX_HEX, EXACT_SUFFIX);

  console.log("\n------------------------------------------------------------");
  console.log("  x402UptoPermit2Proxy");
  console.log("------------------------------------------------------------");
  const uptoResult = mineVanityAddress("upto", uptoInitCodeHash, PREFIX_HEX, UPTO_SUFFIX);

  // Summary
  console.log("\n============================================================");
  console.log("  RESULTS");
  console.log("============================================================");

  if (exactResult) {
    console.log("\nx402ExactPermit2Proxy:");
    console.log(`  Salt:    ${exactResult.salt}`);
    console.log(`  Address: ${exactResult.address}`);
  }

  if (uptoResult) {
    console.log("\nx402UptoPermit2Proxy:");
    console.log(`  Salt:    ${uptoResult.salt}`);
    console.log(`  Address: ${uptoResult.address}`);
  }

  if (exactResult && uptoResult) {
    console.log("\n// Update Deploy.s.sol with these values:");
    console.log(`bytes32 constant EXACT_SALT = ${exactResult.salt};`);
    console.log(`bytes32 constant UPTO_SALT = ${uptoResult.salt};`);
  }
}

main().catch(console.error);
