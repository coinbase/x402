import { setupProperties } from "./properties";
import { attachEventHandlers, createEvent } from "./events";
import { connectWallet, disconnectWallet } from "./wallet-connection";
import { handlePayment } from "./payment-handler";
import { updateStatus, hasWeb3Provider } from "./utils";
import { getComponentStyles } from "./styles";
import { getTemplate } from "./templates";
import { PaymentDetails, paymentDetailsSchema } from "../../types";

export class X402Paywall extends HTMLElement {
  walletAddress: `0x${string}` | null = null;
  walletConnected: boolean = false;
  paymentStatus: "idle" | "processing" | "success" | "error" = "idle";
  testnet: boolean = true;
  amount: string = "0.00";
  description: string = "";
  payToAddress: `0x${string}` = "0x0000000000000000000000000000000000000000";
  usdcBalance: number = 0;

  // Shadow DOM
  private _shadow: ShadowRoot;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });
    setupProperties(this);
  }

  static get observedAttributes() {
    return ["amount", "payToAddress", "description", "testnet", "theme-mode", "theme-preset"];
  }

  connectedCallback() {
    this.render();
    attachEventHandlers(this);
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  // Public methods
  async connectWallet() {
    try {
      if (!hasWeb3Provider()) {
        throw new Error("No Web3 provider found");
      }
      const address = await connectWallet(this);
      this.walletAddress = address;
      this.walletConnected = true;
      this.render();
      this.dispatchEvent(createEvent("walletconnected", { address }));
    } catch (error) {
      updateStatus(
        this,
        `Failed to connect wallet: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async disconnectWallet() {
    try {
      await disconnectWallet(this);
      this.walletAddress = null;
      this.walletConnected = false;
      this.render();
      this.dispatchEvent(createEvent("walletdisconnected"));
    } catch (error) {
      updateStatus(
        this,
        `Failed to disconnect wallet: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async pay() {
    try {
      this.paymentStatus = "processing";
      updateStatus(this, "Processing payment...");
      this.render();

      const result = await handlePayment(this);

      this.paymentStatus = "success";
      updateStatus(this, "Payment successful!");
      this.render();

      this.dispatchEvent(createEvent("paymentsuccess", result));
    } catch (error) {
      this.paymentStatus = "error";
      updateStatus(
        this,
        `Payment failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      this.render();

      this.dispatchEvent(createEvent("paymenterror", { error }));
    }
  }

  private render() {
    const styles = getComponentStyles(this);
    const template = getTemplate(this);

    this._shadow.innerHTML = `
      <style>${styles}</style>
      ${template}
    `;

    // After rendering, reattach button event handlers
    this._attachUIHandlers();
  }

  private _attachUIHandlers() {
    const connectBtn = this._shadow.querySelector("#connect-wallet");
    const disconnectBtn = this._shadow.querySelector("#disconnect-wallet");
    const payBtn = this._shadow.querySelector("#pay-button");

    if (connectBtn) {
      connectBtn.addEventListener("click", () => this.connectWallet());
    }

    if (disconnectBtn) {
      disconnectBtn.addEventListener("click", () => this.disconnectWallet());
    }

    if (payBtn) {
      payBtn.addEventListener("click", () => this.pay());
    }
  }
}
