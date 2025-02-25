interface PaywallOptions {
  amount: number;
  paymentDetails: any;
  currentUrl: string;
  testnet: boolean;
}

export function getPaywallHtml({ amount, testnet }: PaywallOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Required - $${amount}</title>

</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">Payment Required</h1>
            <p class="subtitle">To access this content, please pay $${amount}</p>
        </div>

        <div class="content">
            <div id="connect-section">
                <button id="connect-wallet" class="button button-blue">
                    Connect Wallet
                </button>
            </div>

            <div id="payment-section" class="hidden">
                <div class="payment-details">
                    <div class="payment-row">
                        <span class="payment-label">Amount:</span>
                        <span class="payment-value">$${amount} USDC</span>
                    </div>
                    <div class="payment-row">
                        <span class="payment-label">Network:</span>
                        <span class="payment-value">${
                          testnet ? 'Base Sepolia' : 'Base'
                        }</span>
                    </div>
                </div>

                <button id="pay-button" class="button button-green">
                    Pay Now
                </button>
            </div>

            <div id="status" class="status"></div>
        </div>
    </div>
</body>
</html>`;
}
