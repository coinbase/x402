import { PaymentDetails } from "@/shared/types";
import { PaymentPayload } from "@/shared/types/exact/evm";
import { getVersion } from "@/shared/evm/usdc";
import { createNonce, encodePayment, signAuthorization } from "./sign";
import { SignerWallet } from "@/shared/evm/wallet";
import { Address } from "viem";

export async function createPayment(
  client: SignerWallet,
  paymentDetails: PaymentDetails
): Promise<PaymentPayload> {
  const nonce = createNonce();
  const version = await getVersion(client);
  const from = client!.account!.address;

  const validAfter = BigInt(
    Math.floor(Date.now() / 1000) - 5 // 1 block (2s) before to account for block timestamping
  );
  const validBefore = BigInt(
    Math.floor(Date.now() / 1000 + paymentDetails.requiredDeadlineSeconds)
  );

  const { signature } = await signAuthorization(client, {
    from,
    to: paymentDetails.payToAddress,
    value: paymentDetails.maxAmountRequired,
    validAfter,
    validBefore,
    nonce,
    chainId: client.chain!.id,
    version,
    usdcAddress: paymentDetails.usdcAddress,
  });

  return {
    x402Version: 1,
    scheme: paymentDetails.scheme,
    networkId: paymentDetails.networkId,
    payload: {
      signature,
      authorization: {
        from,
        to: paymentDetails.payToAddress as Address,
        value: paymentDetails.maxAmountRequired,
        validAfter,
        validBefore,
        nonce,
        version,
      },
    },
    resource: paymentDetails.resource,
  };
}

export async function createPaymentHeader(
  client: SignerWallet,
  paymentDetails: PaymentDetails
): Promise<string> {
  const payment = await createPayment(client, paymentDetails);
  return encodePayment(payment);
}
