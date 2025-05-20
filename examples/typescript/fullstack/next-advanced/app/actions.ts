"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { useFacilitator } from "x402/verify";
import { PaymentRequirements } from "x402/types";

export async function verifyPayment(signature: string): Promise<string> {
  // right now this needs to be defined in 2 places, we'll clean this up with a proper nextjs abstraction
  const paymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "10000",
    resource: "https://example.com",
    description: "Payment for a service",
    mimeType: "text/html",
    payTo: "0x0000000000000000000000000000000000000000",
    maxTimeoutSeconds: 60,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    outputSchema: undefined,
    extra: {
      name: "USDC",
      version: "2",
    },
  };

  const { verify, settle } = useFacilitator();

  try {
    const valid = await verify(signature, paymentRequirements);

    if (!valid.isValid) {
      throw new Error(valid.invalidReason);
    }

    const settleResponse = await settle(signature, paymentRequirements);

    if (!settleResponse.success) {
      throw new Error(settleResponse.errorReason);
    }
  } catch (error) {
    // return error as string;
    console.error(error);
  }

  const cookieStore = await cookies();
  // This should be a JWT signed by the server following best practices for a session token
  // See: https://nextjs.org/docs/app/guides/authentication#stateless-sessions
  cookieStore.set("payment-session", signature);
  redirect("/protected");
}
