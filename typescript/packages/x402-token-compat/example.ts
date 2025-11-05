/**
 * Example usage of @b3dotfun/anyspend-x402-token-compat
 *
 * Run with: npx tsx example.ts
 */

import { TokenCompatClient } from "./src";

async function main() {
  // Create a client instance
  const client = new TokenCompatClient();

  console.log("=== Token Compatibility Checker Examples ===\n");

  // Example 1: Check USDC on Base
  console.log("1. Checking USDC on Base:");
  const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  const metadata = await client.getTokenMetadata("base", usdcAddress);
  console.log(`   Name: ${metadata.name}`);
  console.log(`   Symbol: ${metadata.symbol}`);
  console.log(`   Decimals: ${metadata.decimals}`);
  console.log(
    `   Supports EIP-2612 (Permit): ${metadata.supportsEip2612 ? "✅" : "❌"}`
  );
  console.log(
    `   Supports EIP-3009 (TransferWithAuth): ${metadata.supportsEip3009 ? "✅" : "❌"}`
  );
  console.log();

  // Example 2: Check if a token supports Permit
  console.log("2. Quick check for EIP-2612 support:");
  const hasPermit = await client.supportsEip2612("base", usdcAddress);
  console.log(`   USDC supports Permit: ${hasPermit ? "✅" : "❌"}`);
  console.log();

  // Example 3: Get both EIP support statuses
  console.log("3. Get both EIP support statuses:");
  const support = await client.getEipSupport("base", usdcAddress);
  console.log(`   EIP-2612: ${support.supportsEip2612 ? "✅" : "❌"}`);
  console.log(`   EIP-3009: ${support.supportsEip3009 ? "✅" : "❌"}`);
  console.log();

  // Example 4: List all EIP-2612 compatible tokens on Base
  console.log("4. Listing first 10 EIP-2612 compatible tokens on Base:");
  const permitTokens = await client.listEip2612Tokens("base", { limit: 10 });
  console.log(`   Total tokens with Permit: ${permitTokens.pagination.total}`);
  console.log(`   Tokens:`);
  permitTokens.tokens.forEach((token, i) => {
    console.log(`     ${i + 1}. ${token.symbol} - ${token.name}`);
  });
  console.log();

  // Example 5: List fully compatible tokens (both EIP-2612 and EIP-3009)
  console.log("5. Listing tokens with both EIP-2612 and EIP-3009 support:");
  const fullyCompatible = await client.listFullyCompatibleTokens("base", {
    limit: 5,
  });
  console.log(
    `   Total fully compatible tokens: ${fullyCompatible.pagination.total}`
  );
  console.log(`   Tokens:`);
  fullyCompatible.tokens.forEach((token, i) => {
    console.log(`     ${i + 1}. ${token.symbol} - ${token.name}`);
    console.log(`        Address: ${token.tokenAddress}`);
  });
  console.log();

  // Example 6: Get supported chains
  console.log("6. Supported chains:");
  const chains = await client.getSupportedChains();
  chains.forEach((chain) => {
    const status = chain.rpcConfigured ? "✅" : "⚠️";
    console.log(
      `   ${status} ${chain.fullName} (${chain.name}) - Chain ID: ${chain.chainId}`
    );
  });
  console.log();

  // Example 7: Using chain IDs instead of names
  console.log("7. Using chain IDs:");
  const ethChainId = 1;
  const chainName = TokenCompatClient.getChainName(ethChainId);
  console.log(`   Chain ID ${ethChainId} = ${chainName}`);

  const baseChainName = "base";
  const chainId = TokenCompatClient.getChainId(baseChainName);
  console.log(`   Chain name "${baseChainName}" = Chain ID ${chainId}`);
  console.log();

  // Example 8: Pagination
  console.log("8. Pagination example:");
  const firstPage = await client.listTokens("base", { limit: 5, offset: 0 });
  console.log(`   Page 1: ${firstPage.pagination.returned} tokens`);
  console.log(`   Has more: ${firstPage.pagination.hasMore}`);

  if (firstPage.pagination.hasMore) {
    const secondPage = await client.listTokens("base", { limit: 5, offset: 5 });
    console.log(`   Page 2: ${secondPage.pagination.returned} tokens`);
  }
  console.log();

  // Example 9: Error handling
  console.log("9. Error handling example:");
  try {
    await client.getTokenMetadata("base", "0xinvalid");
  } catch (error) {
    if (error instanceof Error) {
      console.log(`   ❌ Error caught: ${error.message}`);
    }
  }
  console.log();

  console.log("=== All examples completed! ===");
}

// Run the examples
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
