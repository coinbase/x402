import { selectPaymentRequirements } from "../../client";
import type { PaymentRequirements } from "../../types/verify";
import { Network, SupportedEVMNetworks, SupportedSVMNetworks } from "../../types/shared";

/**
 * Configuration options for the x402 provider.
 */
export interface X402ProviderConfig {
  cdpClientKey?: string;
  appName?: string;
  appLogo?: string;
  paymentRequirements?: PaymentRequirements | PaymentRequirements[];
  testnet?: boolean;
}

/**
 * Result of provider configuration validation.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates the x402 provider configuration and returns detailed error messages.
 *
 * This function performs early validation to surface configuration issues
 * with clear, actionable error messages before the provider initializes.
 *
 * @param config - The provider configuration to validate.
 * @param options - Additional validation options.
 * @param options.requireApiKey - Whether the CDP API key is required (default: true for production).
 * @returns Validation result with errors and warnings.
 *
 * @example
 * ```typescript
 * const result = validateProviderConfig(window.x402);
 * if (!result.isValid) {
 *   console.error('Configuration errors:', result.errors);
 * }
 * ```
 */
export function validateProviderConfig(
  config: X402ProviderConfig | undefined | null,
  options: { requireApiKey?: boolean } = {},
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { requireApiKey = true } = options;

  // Check if config exists
  if (!config) {
    errors.push(
      "x402 configuration is missing. Ensure window.x402 is defined with required fields: " +
        "{ paymentRequirements, currentUrl }. " +
        "See: https://github.com/coinbase/x402#configuration",
    );
    return { isValid: false, errors, warnings };
  }

  // Validate paymentRequirements
  if (!config.paymentRequirements) {
    errors.push(
      'Missing required field "paymentRequirements" in x402 configuration. ' +
        "This field must contain a PaymentRequirements object or array. " +
        'Example: { paymentRequirements: { network: "base", scheme: "exact", ... } }',
    );
  } else {
    const requirements = normalizePaymentRequirements(config.paymentRequirements);
    if (requirements.length === 0) {
      errors.push(
        'Field "paymentRequirements" is empty. At least one payment requirement must be provided.',
      );
    } else {
      // Validate each requirement has required fields
      requirements.forEach((req, index) => {
        if (!req.network) {
          errors.push(
            `Payment requirement at index ${index} is missing required field "network". ` +
              `Supported networks: ${[...SupportedEVMNetworks, ...SupportedSVMNetworks].join(", ")}`,
          );
        }
        if (!req.scheme) {
          errors.push(`Payment requirement at index ${index} is missing required field "scheme".`);
        }
      });
    }
  }

  // Validate CDP API key
  if (requireApiKey && !config.cdpClientKey) {
    errors.push(
      'Missing "cdpClientKey" (CDP API key) in x402 configuration. ' +
        "This key is required for OnchainKit wallet functionality. " +
        "Get your API key at: https://portal.cdp.coinbase.com/ " +
        'Then set it via: window.x402.cdpClientKey = "your-api-key"',
    );
  } else if (!config.cdpClientKey) {
    warnings.push(
      'No "cdpClientKey" provided. Wallet functionality may be limited. ' +
        "Get an API key at: https://portal.cdp.coinbase.com/",
    );
  }

  // Validate appName and appLogo (optional but recommended)
  if (!config.appName) {
    warnings.push('Consider setting "appName" for a better user experience in wallet prompts.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates the provider configuration and throws a descriptive error if invalid.
 *
 * Use this function to fail fast with clear error messages during provider initialization.
 *
 * @param config - The provider configuration to validate.
 * @param options - Additional validation options.
 * @param options.requireApiKey - Whether the CDP API key is required (default: true).
 * @throws Error with detailed message if configuration is invalid.
 *
 * @example
 * ```typescript
 * // In your provider component:
 * assertValidProviderConfig(window.x402);
 * ```
 */
export function assertValidProviderConfig(
  config: X402ProviderConfig | undefined | null,
  options: { requireApiKey?: boolean } = {},
): asserts config is X402ProviderConfig & {
  paymentRequirements: PaymentRequirements | PaymentRequirements[];
} {
  const result = validateProviderConfig(config, options);

  if (!result.isValid) {
    const errorMessage = [
      "OnchainKitProvider configuration is invalid:",
      "",
      ...result.errors.map((e, i) => `  ${i + 1}. ${e}`),
      "",
      "For complete configuration documentation, see:",
      "https://github.com/coinbase/x402#provider-configuration",
    ].join("\n");

    throw new Error(errorMessage);
  }

  // Log warnings in development
  if (result.warnings.length > 0 && typeof console !== "undefined") {
    result.warnings.forEach(warning => {
      console.warn(`[x402] ${warning}`);
    });
  }
}

const EVM_TESTNETS = new Set<Network>(["base-sepolia"]);
const SVM_TESTNETS = new Set<Network>(["solana-devnet"]);

/**
 * Normalizes the payment requirements into an array.
 *
 * @param paymentRequirements - A single requirement or a list of requirements.
 * @returns An array of payment requirements.
 */
export function normalizePaymentRequirements(
  paymentRequirements: PaymentRequirements | PaymentRequirements[],
): PaymentRequirements[] {
  if (Array.isArray(paymentRequirements)) {
    return paymentRequirements;
  }
  return [paymentRequirements];
}

/**
 * Returns the preferred networks to attempt first when selecting a payment requirement.
 *
 * @param testnet - Whether the paywall is operating in testnet mode.
 * @returns Ordered list of preferred networks.
 */
export function getPreferredNetworks(testnet: boolean): Network[] {
  if (testnet) {
    return ["base-sepolia", "solana-devnet"];
  }
  return ["base", "solana"];
}

/**
 * Selects the most appropriate payment requirement for the user.
 *
 * @param paymentRequirements - All available payment requirements.
 * @param testnet - Whether the paywall is operating in testnet mode.
 * @returns The selected payment requirement.
 */
export function choosePaymentRequirement(
  paymentRequirements: PaymentRequirements | PaymentRequirements[],
  testnet: boolean,
): PaymentRequirements {
  const normalized = normalizePaymentRequirements(paymentRequirements);
  const preferredNetworks = getPreferredNetworks(testnet);

  return selectPaymentRequirements([...normalized], preferredNetworks as Network[], "exact");
}

/**
 * Determines if the provided network is an EVM network.
 *
 * @param network - The network to check.
 * @returns True if the network is EVM based.
 */
export function isEvmNetwork(network: string): network is Network {
  return SupportedEVMNetworks.includes(network as Network);
}

/**
 * Determines if the provided network is an SVM network.
 *
 * @param network - The network to check.
 * @returns True if the network is SVM based.
 */
export function isSvmNetwork(network: string): network is Network {
  return SupportedSVMNetworks.includes(network as Network);
}

/**
 * Provides a human-readable display name for a network.
 *
 * @param network - The network identifier.
 * @returns A display name suitable for UI use.
 */
export function getNetworkDisplayName(network: Network): string {
  switch (network) {
    case "base":
      return "Base";
    case "base-sepolia":
      return "Base Sepolia";
    case "solana":
      return "Solana";
    case "solana-devnet":
      return "Solana Devnet";
    default:
      return network;
  }
}

/**
 * Indicates whether the provided network is a testnet.
 *
 * @param network - The network to evaluate.
 * @returns True if the network is a recognized testnet.
 */
export function isTestnetNetwork(network: Network): boolean {
  return EVM_TESTNETS.has(network) || SVM_TESTNETS.has(network);
}
