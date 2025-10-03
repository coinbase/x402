import { PAYWALL_TEMPLATE } from "../paywall/gen/template";
import { config } from "../types/shared/evm/config";
import { PaymentRequirements, x402Response } from "../types/verify";
import { safeBase64Encode } from "./base64";

interface PaywallOptions {
  amount: number;
  paymentRequirements: PaymentRequirements[];
  currentUrl: string;
  testnet: boolean;
  cdpClientKey?: string;
  appName?: string;
  appLogo?: string;
  sessionTokenEndpoint?: string;
}

type PaywallHeaderInput = {
  x402Version: number;
  accepts: PaymentRequirements[];
};

type PaywallHeaders = {
  "Payment-Requirement": string;
  "x402-Version": string;
};

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
 * Generates an HTML paywall page that allows users to pay for content access
 *
 * @param options - The options for generating the paywall
 * @param options.amount - The amount to be paid in USD
 * @param options.paymentRequirements - The payment requirements for the content
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
  paymentRequirements,
  currentUrl,
  cdpClientKey,
  appName,
  appLogo,
  sessionTokenEndpoint,
}: PaywallOptions): string {
  const logOnTestnet = testnet
    ? "console.log('Payment requirements initialized:', window.x402);"
    : "";

  // Create the configuration script to inject with proper escaping
  const configScript = `
  <script>
    window.x402 = {
      amount: ${amount},
      paymentRequirements: ${JSON.stringify(paymentRequirements)},
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

  // Inject the configuration script into the head
  return PAYWALL_TEMPLATE.replace("</head>", `${configScript}\n</head>`);
}

/**
 * Small utility to build headers sent when responding with a 402 status code and paywall.
 *
 * @param x402Version - The x402 version supported by the server. Also sent in a standalone header for future compatibility.
 * @param accepts - The accepted payment requirements
 */
export const buildPaywallHeaders = ({
  x402Version,
  accepts,
}: PaywallHeaderInput): PaywallHeaders => {
  // Type safety for future compatibility
  const paymentRequiredHeader: x402Response = {
    x402Version,
    accepts,
  };
  return {
    "Payment-Requirement": safeBase64Encode(JSON.stringify(paymentRequiredHeader)),
    "x402-Version": x402Version.toString(),
  };
};
