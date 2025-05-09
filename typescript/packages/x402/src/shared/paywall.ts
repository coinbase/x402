import { PAYWALL_TEMPLATE } from "../paywall/gen/template.js";
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
        chainConfig: {
          "84532": {
            usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            usdcName: "USDC",
          },
          "8453": {
            usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            usdcName: "USDC",
          }
        }
      }
    };
    console.log('Payment details initialized:', window.x402.paymentDetails);
  </script>`;

  // Inject the configuration script into the head
  return PAYWALL_TEMPLATE.replace("</head>", `${configScript}\n</head>`);
}
