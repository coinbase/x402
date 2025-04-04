// Helper to update the component's status message
export function updateStatus(component: any, message: string) {
  const statusElement =
    component.shadowRoot.querySelector("#status") ||
    component.shadowRoot.querySelector('[data-x402-role="status"]');

  if (statusElement) {
    statusElement.textContent = message;
  }

  // Also dispatch a status update event
  component.dispatchEvent(
    new CustomEvent("statusupdated", {
      bubbles: true,
      composed: true,
      detail: { message },
    }),
  );
}

// Helper to parse the amount string to a number
export function parseAmount(amountStr: string): number {
  return parseFloat(amountStr.replace(/[$,]/g, "").trim());
}

// Helper to format number as currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// Check if a Web3 provider is available
export function hasWeb3Provider(): boolean {
  return typeof window !== "undefined" && typeof window.ethereum !== "undefined";
}

// Truncate Ethereum address
export function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Detect the device type
export function getDeviceType(): "mobile" | "tablet" | "desktop" {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}
