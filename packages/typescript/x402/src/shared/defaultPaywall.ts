import { PAYWALL_TEMPLATE } from "../paywall/dist/template.js";

interface PaywallOptions {
  amount: number;
  paymentDetails: any;
  currentUrl: string;
  testnet: boolean;
}

export function getDefaultPaywallHtml({
  amount,
  testnet,
  paymentDetails,
  currentUrl,
}: PaywallOptions): string {
  // Create the configuration script to inject
  const configScript = `
  <script>
    window.x402 = {
      amount: ${amount},
      paymentDetails: ${JSON.stringify(paymentDetails)},
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
