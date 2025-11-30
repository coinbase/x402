"use client";

import { useEffect, useState } from "react";
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from "x402/types";

type X402ErrorReason =
  | NonNullable<VerifyResponse["invalidReason"]>
  | NonNullable<SettleResponse["errorReason"]>;

interface X402ErrorResponseBody {
  x402Version: number;
  error?: X402ErrorReason;
  accepts?: PaymentRequirements[];
  payer?: string;
}

interface DemoResult {
  message: string;
  network: string;
  transaction: string;
  amountSats: string;
  randomNumber: number;
}

type Stage = "idle" | "loading" | "needsPayment" | "sendingPayment" | "paid" | "error";

export default function LightningDemoPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [requirements, setRequirements] = useState<PaymentRequirements | null>(null);
  const [bolt11, setBolt11] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);

  useEffect(() => {
    void loadProtectedResourceWithoutPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Call the demo API without any X-PAYMENT header.
   * This should return 402 + x402 payment requirements.
   */
  const loadProtectedResourceWithoutPayment = async () => {
    setStage("loading");
    setError(null);
    setResult(null);

    const res = await fetch("/examples/lightning", {
      method: "GET",
    });

    if (res.status === 200) {
      // Somehow already paid (or payment disabled)
      const data = (await res.json()) as DemoResult;
      setResult(data);
      setStage("paid");
      return;
    }

    if (res.status !== 402) {
      setError(`Unexpected status ${res.status} from /examples/lightning`);
      setStage("error");
      return;
    }

    const body = (await res.json()) as X402ErrorResponseBody;

    if (!body.accepts || body.accepts.length === 0) {
      setError("402 response did not include any payment requirements.");
      setStage("error");
      return;
    }

    setRequirements(body.accepts[0]);
    setStage("needsPayment");
  };

  /**
   * Build a PaymentPayload from the pasted BOLT11 invoice.
   * This is what we send in the X-PAYMENT header.
   */
  const buildPaymentPayload = (): PaymentPayload | null => {
    if (!requirements) return null;

    if (!bolt11.trim()) {
      setError("Please paste a BOLT11 invoice from your Lightning wallet.");
      return null;
    }

    const payload: PaymentPayload = {
      x402Version: 1,
      scheme: "exact",
      network: requirements.network,
      payload: {
        // Lightning payload shape
        bolt11: bolt11.trim(),
        invoiceId: undefined,
      },
    };

    return payload;
  };

  /**
   * Call the demo API WITH an X-PAYMENT header containing the Lightning invoice.
   * If the invoice is valid AND settled, the API will return 200 with demo data.
   */
  const callWithPayment = async () => {
    setStage("sendingPayment");
    setError(null);
    setResult(null);

    const paymentPayload = buildPaymentPayload();
    if (!paymentPayload) {
      setStage("needsPayment");
      return;
    }

    const res = await fetch("/examples/lightning", {
      method: "GET",
      headers: {
        "X-PAYMENT": JSON.stringify(paymentPayload),
      },
    });

    if (res.status === 200) {
      const data = (await res.json()) as DemoResult;
      setResult(data);
      setStage("paid");
      return;
    }

    if (res.status === 402) {
      const body = (await res.json()) as X402ErrorResponseBody;
      const reason = body.error ?? "invalid_payment";
      setError(
        `Payment not accepted yet. Error reason: ${reason}. If your wallet just paid the invoice, wait a moment and try again.`,
      );
      setStage("needsPayment");
      return;
    }

    setError(`Unexpected status ${res.status} when sending payment`);
    setStage("error");
  };

  const amountSats = requirements?.maxAmountRequired ?? "1000";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8">
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8">
        <h1 className="text-2xl font-bold">x402 Lightning Demo</h1>

        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            We call a protected endpoint at <code>/examples/lightning</code>.
          </li>
          <li>
            It replies with HTTP <code>402</code> and a JSON x402 error body describing a Lightning
            payment requirement.
          </li>
          <li>
            You create a BOLT11 invoice in your own Lightning wallet for{" "}
            <strong>{amountSats} sats</strong> on{" "}
            <code>{requirements?.network ?? "your Lightning network"}</code>.
          </li>
          <li>
            Paste that invoice here, we send it in the <code>X-PAYMENT</code> header, and if it is
            paid, the API unlocks the data.
          </li>
        </ol>
        {/* ...rest stays exactly as you have it ... */}
      </main>

      {requirements && (
        <section className="rounded-md border border-gray-700 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Payment requirements</h2>
          <p>
            <strong>Network:</strong> {requirements.network}
          </p>
          <p>
            <strong>Amount:</strong> {requirements.maxAmountRequired} sats
          </p>
          <p>
            <strong>Description:</strong> {requirements.description}
          </p>
        </section>
      )}

      {stage === "loading" && <p>Loading payment requirements…</p>}

      {(stage === "needsPayment" || stage === "sendingPayment") && (
        <section className="space-y-3">
          <label className="block text-sm">
            BOLT11 invoice from your Lightning wallet:
            <textarea
              value={bolt11}
              onChange={e => setBolt11(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-gray-700 bg-black/40 p-2 text-xs"
              placeholder="Paste ln... invoice here"
            />
          </label>
          <button
            type="button"
            onClick={callWithPayment}
            disabled={stage === "sendingPayment"}
            className="rounded-md border border-blue-500 px-4 py-2 text-sm font-semibold hover:bg-blue-500/10 disabled:opacity-50"
          >
            {stage === "sendingPayment" ? "Sending payment…" : "Send payment & retry"}
          </button>
        </section>
      )}

      {stage === "paid" && result && (
        <section className="space-y-2 rounded-md border border-emerald-600 p-4 text-sm">
          <h2 className="font-semibold text-emerald-400">Access granted ✅</h2>
          <p>{result.message}</p>
          <p>
            <strong>Network:</strong> {result.network}
          </p>
          <p>
            <strong>Transaction:</strong> {result.transaction}
          </p>
          <p>
            <strong>Amount:</strong> {result.amountSats} sats
          </p>
          <p>
            <strong>Random number (demo data):</strong> {result.randomNumber}
          </p>
        </section>
      )}

      {error && (
        <p className="rounded-md border border-red-600 bg-red-600/10 p-3 text-xs text-red-200">
          {error}
        </p>
      )}
    </main>
  );
}
