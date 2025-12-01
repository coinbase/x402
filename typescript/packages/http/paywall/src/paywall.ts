import { PAYWALL_TEMPLATE } from "./gen/template";

import type { PaymentRequired } from "./types";

interface PaywallOptions {
  amount: number;
  paymentRequired: PaymentRequired;
  currentUrl: string;
  testnet: boolean;
  cdpClientKey?: string;
  appName?: string;
  appLogo?: string;
  sessionTokenEndpoint?: string;
}

/**
 * Escapes a string for safe injection into JavaScript string literals
 *
 * @param str - The string to escape
 * @returns The escaped string
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Gets the EVM chain config from window.x402.config
 * This is a placeholder that will be populated at runtime
 *
 * @returns The chain config
 */
function getChainConfig() {
  return {
    base: {
      usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      usdcName: "USDC",
    },
    "base-sepolia": {
      usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      usdcName: "USDC",
    },
  };
}

/**
 * Generates an HTML paywall page that allows users to pay for content access
 *
 * @param options - The options for generating the paywall
 * @param options.amount - The amount to be paid in USD
 * @param options.paymentRequired - The payment required response with accepts array
 * @param options.currentUrl - The URL of the content being accessed
 * @param options.testnet - Whether to use testnet or mainnet
 * @param options.cdpClientKey - CDP client API key for OnchainKit
 * @param options.appName - The name of the application to display in the wallet connection modal
 * @param options.appLogo - The logo of the application to display in the wallet connection modal
 * @param options.sessionTokenEndpoint - The API endpoint for generating session tokens for Onramp authentication
 * @returns An HTML string containing the paywall page
 */
export function getPaywallHtml({
  amount,
  testnet,
  paymentRequired,
  currentUrl,
  cdpClientKey,
  appName,
  appLogo,
  sessionTokenEndpoint,
}: PaywallOptions): string {
  const logOnTestnet = testnet ? "console.log('Payment required initialized:', window.x402);" : "";

  const config = getChainConfig();

  const configScript = `
  <script>
    window.x402 = {
      amount: ${amount},
      paymentRequired: ${JSON.stringify(paymentRequired)},
      testnet: ${testnet},
      currentUrl: "${escapeString(currentUrl)}",
      config: {
        chainConfig: ${JSON.stringify(config)},
      },
      cdpClientKey: "${escapeString(cdpClientKey || "")}",
      appName: "${escapeString(appName || "")}",
      appLogo: "${escapeString(appLogo || "")}",
      sessionTokenEndpoint: "${escapeString(sessionTokenEndpoint || "")}",
    };
    ${logOnTestnet}
  </script>`;

  return PAYWALL_TEMPLATE.replace("</head>", `${configScript}\n</head>`);
}
