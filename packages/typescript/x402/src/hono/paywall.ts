import { PaymentDetails } from "../types";

export const getPaywallHtml = (paymentDetails: PaymentDetails, testnet: boolean) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Required</title>
  <script type="module" src="https://esm.sh/@x402/typescript/dist/paywall/index.js"></script>
  <style>
      body {
          margin: 0;
          font-family: system-ui, -apple-system, sans-serif;
          background: #f5f5f5;
      }
      .container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
      }
      .card {
          background: white;
          padding: 2rem;
          border-radius: 1rem;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          max-width: 32rem;
          width: 100%;
      }
  </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <x402-paywall
                amount="${paymentDetails.maxAmountRequired / BigInt(10 ** 6)}"
                pay-to-address="${paymentDetails.payToAddress}"
                description="${paymentDetails.description}"
                testnet="${testnet}"
            ></x402-paywall>
        </div>
    </div>
</body>
</html>
`;
