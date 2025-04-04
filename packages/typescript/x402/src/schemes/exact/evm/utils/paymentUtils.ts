import { paymentPayloadSchema } from "../types";
import { safeBase64Encode, safeBase64Decode } from "../../../../shared";
import { PaymentPayload } from "../../exact/evm/types";

export function encodePayment(payment: PaymentPayload): string {
  const safe = {
    ...payment,
    payload: {
      ...payment.payload,
      authorization: Object.fromEntries(
        Object.entries(payment.payload.authorization).map(([key, value]) => [
          key,
          typeof value === "bigint" ? value.toString() : value,
        ]),
      ),
    },
  };
  return safeBase64Encode(JSON.stringify(safe));
}

export function decodePayment(payment: string): PaymentPayload {
  const decoded = safeBase64Decode(payment);
  const parsed = JSON.parse(decoded);

  const obj = {
    ...parsed,
    payload: {
      signature: parsed.payload.signature,
      authorization: {
        ...parsed.payload.authorization,
        value: BigInt(parsed.payload.authorization.value),
        validAfter: BigInt(parsed.payload.authorization.validAfter),
        validBefore: BigInt(parsed.payload.authorization.validBefore),
      },
    },
  };

  const validated = paymentPayloadSchema.parse(obj);
  return validated;
}
