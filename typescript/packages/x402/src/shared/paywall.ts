import { PAYWALL_TEMPLATE } from "../paywall/gen/template";
import { config } from "../types/shared/config";
import { PaymentRequirements } from "../types/verify";

interface PaywallOptions {
  amount: number;
  paymentRequirements: PaymentRequirements[];
  currentUrl: string;
  testnet: boolean;
}

/**
 * Generates an HTML paywall page that allows users to pay for content access
 *
 * @param options - The options for generating the paywall
 * @param options.amount - The amount to be paid in USD
 * @param options.paymentRequirements - The payment requirements for the content
 * @param options.currentUrl - The URL of the content being accessed
 * @param options.testnet - Whether to use testnet or mainnet
 * @returns An HTML string containing the paywall page
 */
export function getPaywallHtml({
  amount,
  testnet,
  paymentRequirements,
  currentUrl,
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
      }
    };
    console.log('Payment details initialized:', window.x402.paymentDetails);
  </script>`;

  // Inject the configuration script into the head
  return PAYWALL_TEMPLATE.replace("</head>", `${configScript}\n</head>`);
}
