// Empty paywall HTML template. Content here is static but can be changed at runtime.
/**
 * Returns a base HTML template for the X402 paywall.
 * This template contains the structure for payment prompts, wallet connection,
 * and transaction details.
 *
 * @returns {string} HTML template string for the paywall
 */
export function getBaseTemplate(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
        <div class="container">
          <div class="header">
            <h1 class="title">Payment Required</h1>
            <p class="subtitle" id="payment-description">Loading payment details...</p>
            <p class="instructions" id="instructions">Need Base Sepolia USDC? <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get some here.</a></p>
          </div>

          <div class="content">
            <div id="connect-section">
              <button id="connect-wallet" class="button button-primary">
                  Connect wallet
              </button>
            </div>

            <div id="payment-section" class="hidden">
              <div class="payment-details">
                <div class="payment-row">
                  <span class="payment-label">Wallet:</span>
                  <span class="payment-value" id="payment-account">Loading...</span>
                </div>
                <div class="payment-row">
                  <span class="payment-label">Amount:</span>
                  <span class="payment-value" id="payment-amount">Loading...</span>
                </div>
                <div class="payment-row">
                  <span class="payment-label">Network:</span>
                  <span class="payment-value" id="payment-network">Loading...</span>
                </div>
              </div>

              <button id="pay-button" class="button button-secondary">
                  Pay Now
              </button>
            </div>
            <div id="status" class="status"></div>
          </div>
        </div>
    </body>
    </html>
  `;
}
