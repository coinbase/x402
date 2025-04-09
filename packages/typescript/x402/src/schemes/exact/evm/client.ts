import { Address, Chain, Transport } from "viem";
import { PaymentDetails } from "../../../types/index.js";
import { PaymentPayload } from "./types.js";
import { getVersion } from "../../../shared/evm/usdc.js";
import { createNonce, signAuthorization } from "./sign.js";
import { encodePayment } from "./utils/paymentUtils.js";
import { SignerWallet } from "../../../shared/evm/wallet.js";
export async function createPayment<transport extends Transport, chain extends Chain>(
  client: SignerWallet<chain, transport>,
  paymentDetails: PaymentDetails,
): Promise<PaymentPayload> {
  const nonce = createNonce();
  const version = await getVersion(client);
  const from = client!.account!.address;

  const validAfter = BigInt(
    Math.floor(Date.now() / 1000) - 5, // 1 block (2s) before to account for block timestamping
  );
  const validBefore = BigInt(
    Math.floor(Date.now() / 1000 + paymentDetails.requiredDeadlineSeconds),
  );

  const { signature } = await signAuthorization(
    client,
    {
      from,
      to: paymentDetails.payToAddress as Address,
      value: paymentDetails.maxAmountRequired,
      validAfter,
      validBefore,
      nonce,
      version,
    },
    paymentDetails,
  );

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
  paymentDetails: PaymentDetails,
): Promise<string> {
  const payment = await createPayment(client, paymentDetails);
  return encodePayment(payment);
}
