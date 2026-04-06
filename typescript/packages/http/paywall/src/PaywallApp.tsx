"use client";

import { useCallback } from "react";
import type { PaymentRequired } from "@x402/core/types";
import { isEvmNetwork, isSvmNetwork } from "./paywallUtils";
import { EvmPaywall } from "./evm/EvmPaywall";
import { SolanaPaywall } from "./svm/SolanaPaywall";

/**
 * Main Paywall App Component
 *
 * @returns The PaywallApp component
 */
export function PaywallApp() {
  const x402 = window.x402;
  const paymentRequired: PaymentRequired = x402.paymentRequired;

  const handleSuccessfulResponse = useCallback(async (response: Response) => {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      document.documentElement.innerHTML = await response.text();
    } else {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.location.href = url;
    }
  }, []);

  if (!paymentRequired || !paymentRequired.accepts || paymentRequired.accepts.length === 0) {
    return (
      <div className="paywall-page">
        <div className="card">
          <div className="card-body">
            <div className="amount-section">
              <div className="amount-value">...</div>
              <div className="amount-asset">Loading payment details</div>
            </div>
          </div>
          <div className="card-footer">
            <span className="powered-by">
              Powered by{" "}
              <a href="https://x402.org" target="_blank" rel="noopener noreferrer">
                x402
              </a>
            </span>
          </div>
        </div>
      </div>
    );
  }

  const firstRequirement = paymentRequired.accepts[0];
  const network = firstRequirement.network;

  if (isEvmNetwork(network)) {
    return (
      <EvmPaywall
        paymentRequired={paymentRequired}
        onSuccessfulResponse={handleSuccessfulResponse}
      />
    );
  }

  if (isSvmNetwork(network)) {
    return (
      <SolanaPaywall
        paymentRequired={paymentRequired}
        onSuccessfulResponse={handleSuccessfulResponse}
      />
    );
  }

  return (
    <div className="paywall-page">
      <div className="card">
        <div className="card-body">
          <div className="amount-section">
            <div className="amount-value">Unsupported network</div>
            <div className="amount-asset">
              Please contact the application developer.
            </div>
          </div>
        </div>
        <div className="card-footer">
          <span className="powered-by">
            Powered by{" "}
            <a href="https://x402.org" target="_blank" rel="noopener noreferrer">
              x402
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
