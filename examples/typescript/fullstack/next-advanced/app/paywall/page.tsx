"use client";

import { Wallet } from "@coinbase/onchainkit/wallet";
import { useState } from "react";
import { verifyPayment } from "../actions";
import { PaymentRequirements, PaymentPayload } from "x402/types";
import { preparePaymentHeader } from "x402/client";
import { getNetworkId } from "x402/shared";
import { exact } from "x402/schemes";
import { useAccount, useSignTypedData } from "wagmi";

function PaymentForm({
  paymentRequirements,
}: {
  paymentRequirements: PaymentRequirements;
}) {
  const { address, isConnected } = useAccount();
  const [isProcessing, setIsProcessing] = useState(false);
  const { isError, isSuccess, signTypedDataAsync } = useSignTypedData();

  if (!address || !isConnected) {
    return (
      <div>
        <Wallet />
        <p>Please connect your wallet to proceed with payment.</p>
      </div>
    );
  }

  const unSignedPaymentHeader = preparePaymentHeader(
    address,
    1,
    paymentRequirements
  );

  const eip712Data = {
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    domain: {
      name: paymentRequirements.extra?.name,
      version: paymentRequirements.extra?.version,
      chainId: getNetworkId(paymentRequirements.network),
      verifyingContract: paymentRequirements.asset as `0x${string}`,
    },
    primaryType: "TransferWithAuthorization" as const,
    message: unSignedPaymentHeader.payload.authorization,
  };

  async function handlePayment() {
    setIsProcessing(true);
    const signature = await signTypedDataAsync(eip712Data);

    const paymentPayload: PaymentPayload = {
      ...unSignedPaymentHeader,
      payload: {
        ...unSignedPaymentHeader.payload,
        signature,
      },
    };

    const payment: string = exact.evm.encodePayment(paymentPayload);

    const verifyPaymentWithPayment = verifyPayment.bind(null, payment);
    const result = await verifyPaymentWithPayment();
    console.log("result", result);
    setIsProcessing(false);
  }

  return (
    <div>
      <Wallet />
      <p>
        {paymentRequirements.maxAmountRequired} to {paymentRequirements.payTo}{" "}
        for {paymentRequirements.description}
      </p>

      <button
        disabled={!isConnected}
        onClick={handlePayment}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        Pay
      </button>
      {isProcessing && <p>Processing...</p>}
      {isSuccess && <p>Signed...</p>}
      {isError && <p>Payment failed</p>}
    </div>
  );
}

export default function Paywall() {
  const paymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "10000",
    resource: "https://example.com",
    description: "Payment for a service",
    mimeType: "text/html",
    payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    maxTimeoutSeconds: 60,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    outputSchema: undefined,
    extra: {
      name: "USDC",
      version: "2",
    },
  };
  return (
    <div>
      <PaymentForm paymentRequirements={paymentRequirements} />
    </div>
  );
}
