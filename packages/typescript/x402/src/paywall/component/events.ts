import { hasWeb3Provider, updateStatus } from "./utils";
import { watchAccount } from "@wagmi/core";
import { base, baseSepolia } from "viem/chains";
import { X402Paywall } from "./x402-paywall";
import { wagmiConfig } from "./config";

// Helper to create custom events
export function createEvent(name: string, detail: any = {}) {
  return new CustomEvent(name, {
    bubbles: true,
    composed: true,
    detail,
  });
}

// Attach event handlers to component elements
export function attachEventHandlers(component: X402Paywall) {
  // Data attribute selector support for custom templates
  const getElement = (selector: string, dataRole: string) => {
    return (
      component.shadowRoot?.querySelector(selector) ||
      component.shadowRoot?.querySelector(`[data-x402-role="${dataRole}"]`)
    );
  };

  // Get UI elements
  const connectButton = getElement("#connect-wallet", "connect-wallet");
  const disconnectButton = getElement("#disconnect-wallet", "disconnect-wallet");
  const payButton = getElement("#pay-button", "pay-button");

  // Add event listeners
  if (connectButton) {
    connectButton.addEventListener("click", () => component.connectWallet());
  }

  if (disconnectButton) {
    disconnectButton.addEventListener("click", () => component.disconnectWallet());
  }

  if (payButton) {
    payButton.addEventListener("click", () => component.pay());
  }
}

// List of component events for documentation
export const COMPONENT_EVENTS = {
  WALLET_CONNECTED: "walletconnected",
  WALLET_DISCONNECTED: "walletdisconnected",
  PAYMENT_SUCCESS: "paymentsuccess",
  PAYMENT_ERROR: "paymenterror",
  STATUS_UPDATED: "statusupdated",
};

// Listen for external events (like wallet state changes)
export function setupExternalEventListeners(component: any) {
  if (hasWeb3Provider()) {
    // Watch for account changes
    const unwatchAccount = watchAccount(wagmiConfig, {
      onChange(data) {
        if (data.address) {
          component.walletAddress = data.address as `0x${string}`;
        }
      },
    });

    // Watch for chain changes using window.ethereum
    const chainHandler = (chainId: string) => {
      const networkId = parseInt(chainId, 16);
      const isTestnet = component.testnet;
      const expectedChainId = isTestnet ? baseSepolia.id : base.id;

      if (networkId !== expectedChainId) {
        updateStatus(component, `Please switch to ${isTestnet ? "Base Sepolia Testnet" : "Base"}`);
      } else {
        updateStatus(component, "Connected to correct network");
      }
    };

    window.ethereum!.on("chainChanged", chainHandler);

    // Return cleanup function
    return () => {
      unwatchAccount();
      // Since window.ethereum is an EIP-1193 provider, we use the same 'on' method to remove the listener
      window.ethereum!.on("chainChanged", chainHandler);
    };
  }
}
