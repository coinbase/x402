import { PAYWALL_TEMPLATE } from "../paywall/gen/template";
import { config } from "../types/shared/evm/config";
import { PaymentRequirements } from "../types/verify";

interface PaywallOptions {
  amount: number;
  paymentRequirements: PaymentRequirements[];
  currentUrl: string;
  testnet: boolean;
  cdpClientKey?: string;
  appName?: string;
  appLogo?: string;
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
}: PaywallOptions): string {
  // Create the configuration script to inject
  const configScript = `
  <script>
    window.x402 = {
      amount: ${amount},
      paymentRequirements: ${JSON.stringify(paymentRequirements)},
      testnet: ${testnet},
      currentUrl: "${currentUrl}",
      config: {
        chainConfig: ${JSON.stringify(config)},
      },
      cdpClientKey: "${cdpClientKey}",
      appName: "${appName}",
      appLogo: "${appLogo}",
    };
    console.log('Payment details initialized:', window.x402);
  </script>`;

  // Inject the configuration script into the head
  return PAYWALL_TEMPLATE.replace("</head>", `${configScript}\n</head>`);
}
