export function getTemplate(component: any) {
  // Check if a custom template is requested
  if (component.shadowRoot.querySelector('slot[name="custom-template"]')) {
    return getCustomTemplate();
  }

  // Use the default template
  return getDefaultTemplate(component);
}

function getDefaultTemplate(component: any) {
  const walletConnected = component.walletConnected;
  const walletAddress = component.walletAddress;
  const paymentStatus = component.paymentStatus;

  return `
    <div class="container">
      <div class="header">
        <slot name="header">
          <div class="title">Pay to Access</div>
          <div class="subtitle">Amount: $${component.amount}</div>
          <div class="description">${component.description}</div>
          <div class="network">${component.testnet ? "Testnet" : "Mainnet"}</div>
        </slot>
      </div>

      <div class="wallet-section">
        ${
          walletConnected
            ? `<button class="button" id="disconnect-wallet">Disconnect (${walletAddress?.slice(0, 6)}...${walletAddress?.slice(-4)})</button>`
            : `<button class="button" id="connect-wallet">Connect Wallet</button>`
        }
      </div>

      <div class="payment-section ${!walletConnected ? "hidden" : ""}">
        <div class="payment-details">
          <slot name="payment-details">
            <div class="payment-row">
              <span class="payment-label">Amount:</span>
              <span class="payment-value">$${component.amount}</span>
            </div>
            <div class="payment-row">
              <span class="payment-label">Network:</span>
              <span class="payment-value">${component.testnet ? "Base Sepolia (Testnet)" : "Base"}</span>
            </div>
          </slot>
        </div>

        <button class="button button-green ${paymentStatus === "processing" ? "disabled" : ""}" id="pay-button">
          ${paymentStatus === "processing" ? "Processing..." : "Pay & Access"}
        </button>

        <button class="button button-outline" id="onramp-button">
          Need USDC?
        </button>
      </div>

      <div id="status" class="status"></div>

      <div class="footer">
        <slot name="footer"></slot>
      </div>
    </div>
  `;
}

function getCustomTemplate() {
  return `
    <slot name="custom-template">
      <!-- This slot will be filled with user-provided custom template -->
    </slot>
  `;
}
