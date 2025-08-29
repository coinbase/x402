import { Money, ERC20TokenAmount } from "./";
import { WalletPolicy, PaymentPolicy, USDC_ADDRESSES, AssetPolicy } from "./wallet-policy";

/**
 * Converts a legacy maxValue (bigint) to a WalletPolicy
 */
export function convertMaxValueToPolicy(maxValue: bigint): WalletPolicy {
  // Convert bigint atomic units to Money string format (assuming USDC with 6 decimals)
  const dollarAmount: Money = `$${(Number(maxValue) / 10**6).toFixed(2)}`;
  
  return {
    payments: {
      networks: {
        "base": dollarAmount,
        "base-sepolia": dollarAmount  // Support both mainnet and testnet
      }
    }
  };
}

/**
 * Gets the default policy (equivalent to 0.1 USDC limit on base-sepolia)
 */
export function getDefaultPolicy(): WalletPolicy {
  return {
    payments: {
      networks: {
        "base-sepolia": "$0.10"  // Default to testnet for safety
      }
    }
  };
}

/**
 * Processes the unified parameter and returns an effective policy
 */
export function processUnifiedParameter(policyOrMaxValue?: WalletPolicy | bigint): WalletPolicy {
  if (typeof policyOrMaxValue === 'bigint') {
    console.warn(
      'Passing bigint directly is deprecated. Consider using WalletPolicy format for more flexibility. ' +
      'See https://docs.x402.dev/migration-guide for details.'
    );
    return convertMaxValueToPolicy(policyOrMaxValue);
  }
  
  return policyOrMaxValue || getDefaultPolicy();
}

/**
 * Parses Money string to atomic units
 */
export function parseMoneyToAtomicUnits(money: Money, decimals: number): string {
  const moneyStr = String(money);
  
  if (moneyStr.startsWith('$')) {
    // Parse dollar amount: "$0.10" -> atomic units
    const value = parseFloat(moneyStr.substring(1));
    return BigInt(Math.floor(value * 10 ** decimals)).toString();
  }
  
  // Parse as decimal token amount: "1.5" -> atomic units
  const value = parseFloat(moneyStr);
  return BigInt(Math.floor(value * 10 ** decimals)).toString();
}

/**
 * Expands Money shorthand to a complete NetworkPolicy using USDC
 */
export function expandMoneyToNetworkPolicy(network: string, money: Money): { [address: string]: AssetPolicy } {
  const usdcAddress = USDC_ADDRESSES[network as keyof typeof USDC_ADDRESSES];
  if (!usdcAddress) {
    throw new Error(`Money shorthand not supported for network: ${network}`);
  }
  
  // Create ERC20TokenAmount using existing types
  const tokenAmount: ERC20TokenAmount = {
    amount: parseMoneyToAtomicUnits(money, 6), // USDC has 6 decimals
    asset: {
      address: usdcAddress as `0x${string}`,
      decimals: 6,
      eip712: {
        name: "USD Coin",
        version: "2"
      }
    }
  };
  
  return {
    [usdcAddress]: {
      limit: tokenAmount
    }
  };
}

/**
 * Validates a payment amount against the effective policy
 */
export function validatePaymentAgainstPolicy(
  network: string,
  asset: string,
  amount: bigint,
  effectivePolicy: WalletPolicy
): boolean {
  const networkPolicy = effectivePolicy.payments?.networks[network];
  if (!networkPolicy) {
    return false;
  }
  
  // Handle shorthand (Money) vs full format (NetworkPolicy)
  if (typeof networkPolicy === 'string' || typeof networkPolicy === 'number') {
    // This is Money shorthand - expand and validate
    const expandedPolicy = expandMoneyToNetworkPolicy(network, networkPolicy);
    return validateAssetLimit(asset, amount, expandedPolicy);
  } else {
    // This is a NetworkPolicy - validate against specific asset policy
    return validateAssetLimit(asset, amount, networkPolicy);
  }
}

/**
 * Validates an asset amount against its policy limit
 */
function validateAssetLimit(
  asset: string,
  amount: bigint,
  networkPolicy: { [address: string]: AssetPolicy } | { native?: AssetPolicy }
): boolean {
  let assetPolicy: AssetPolicy | undefined;
  
  if ('native' in networkPolicy && networkPolicy.native) {
    // This is for native currency
    assetPolicy = networkPolicy.native;
  } else {
    // Look up specific asset
    assetPolicy = (networkPolicy as { [address: string]: AssetPolicy })[asset];
  }
  
  if (!assetPolicy?.limit) {
    return false; // No policy means not allowed
  }
  
  // Convert limit to bigint for comparison
  let limitAmount: bigint;
  
  if (typeof assetPolicy.limit === 'string' || typeof assetPolicy.limit === 'number') {
    // It's Money - parse to atomic units
    // We need to know decimals - assume 6 for USDC, 18 for others
    const decimals = asset.toLowerCase().includes('usdc') ? 6 : 18;
    limitAmount = BigInt(parseMoneyToAtomicUnits(assetPolicy.limit, decimals));
  } else {
    // It's ERC20TokenAmount
    limitAmount = BigInt(assetPolicy.limit.amount);
  }
  
  return amount <= limitAmount;
}