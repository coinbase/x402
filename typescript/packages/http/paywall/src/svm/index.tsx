import React from "react";
import { createRoot } from "react-dom/client";
import { SolanaPaywall } from "./SolanaPaywall";

// SVM-specific paywall entry point
window.addEventListener("load", () => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    console.error("Root element not found");
    return;
  }

  const x402 = window.x402;

  const root = createRoot(rootElement);
  root.render(
    <SolanaPaywall
      paymentRequirement={x402.paymentRequirements[0]}
      onSuccessfulResponse={async (response: Response) => {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
          document.documentElement.innerHTML = await response.text();
        } else {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          window.location.href = url;
        }
      }}
    />,
  );
});
