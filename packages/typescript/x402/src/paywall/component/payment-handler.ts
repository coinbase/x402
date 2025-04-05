import { createPaymentHeader } from "../../schemes/exact/evm/client";
import { SignerWallet } from "../../shared/evm/wallet";
import { createWalletClient, publicActions, custom } from "viem";
import { base, baseSepolia } from "viem/chains";
import { X402Paywall } from "./x402-paywall";
import { updateStatus } from "./utils";
import { chainConfig } from "./config";

export async function handlePayment(component: X402Paywall) {
  if (!component.walletConnected || !component.walletAddress) {
    throw new Error("Wallet not connected");
  }

  try {
    updateStatus(component, "Creating payment signature...");

    // Get payment details from component attributes
    const paymentDetails = createPaymentDetails(component);

    const walletClient: SignerWallet = createWalletClient({
      account: component.walletAddress,
      chain: component.testnet ? baseSepolia : base,
      transport: custom(window.ethereum!),
    }).extend(publicActions) as SignerWallet;

    const paymentHeader = await createPaymentHeader(walletClient, paymentDetails);

    updateStatus(component, "Processing payment...");

    const response = await fetch(component.getAttribute("resource") || window.location.href, {
      headers: {
        "X-PAYMENT": paymentHeader,
        "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
      },
    });

    // Check if payment was successful
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Payment failed");
    }

    updateStatus(component, "Payment successful!");

    // Get payment response header
    const paymentResponse = response.headers.get("X-PAYMENT-RESPONSE");

    // Handle response based on content type
    const contentType = response.headers.get("content-type");
    let content;

    if (contentType && contentType.includes("application/json")) {
      content = await response.json();
    } else if (contentType && contentType.includes("text/html")) {
      content = await response.text();

      // If we got HTML, we might want to replace the page content
      if (component.getAttribute("auto-replace") !== "false") {
        document.documentElement.innerHTML = content;
      }
    } else {
      // For binary content, create a download or blob URL
      const blob = await response.blob();
      content = URL.createObjectURL(blob);

      // Auto-download if specified
      if (component.getAttribute("auto-download") !== "false") {
        const link = document.createElement("a");
        link.href = content;
        link.download =
          response.headers.get("content-disposition")?.split("filename=")[1] || "download";
        link.click();
      }
    }

    // Return result with content and payment response
    return {
      content,
      paymentResponse,
      headers: Object.fromEntries([...response.headers]),
    };
  } catch (error) {
    updateStatus(
      component,
      `Payment failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    throw error;
  }
}

// Create payment details object from component properties
function createPaymentDetails(component: X402Paywall) {
  const isTestnet = component.testnet;
  const networkId = isTestnet ? "84532" : "8453";

  // Parse the amount to a number and convert to USDC base units (6 decimals)
  const amountStr = component.amount.toString().replace("$", "").trim();
  const amount = parseFloat(amountStr);
  const amountInBaseUnits = BigInt(Math.round(amount * 10 ** 6));

  // Ensure resource URL is properly formatted
  const resourceUrl = component.getAttribute("resource") || window.location.href;
  if (!resourceUrl.includes("://")) {
    throw new Error("Invalid resource URL format. Must include protocol (e.g., https://)");
  }

  // Import from your existing code to match the required format
  return {
    scheme: "exact",
    networkId,
    maxAmountRequired: amountInBaseUnits,
    resource: resourceUrl as `${string}://${string}`,
    description: component.description,
    mimeType: component.getAttribute("mime-type") || "",
    payToAddress: component.payToAddress,
    requiredDeadlineSeconds: parseInt(component.getAttribute("deadline-seconds") || "60"),
    usdcAddress: chainConfig[networkId].usdcAddress,
    outputSchema: null,
    extra: null,
  };
}
