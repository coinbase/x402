import {
  AuthorizationParameters,
  PayloadV1,
  PaymentNeededDetails,
  PaymentPayloadV1,
  authorizationParametersSchema,
  payloadV1Schema,
  paymentNeededDetailsSchema,
  paymentPayloadV1Schema,
} from "../types";

export function paymentNeededDetailsToJsonSafe(
  paymentNeededDetails: PaymentNeededDetails
) {
  return {
    ...paymentNeededDetails,
    maxAmountRequired: paymentNeededDetails.maxAmountRequired.toString(),
  };
}

export function paymentNeededDetailsFromObj(data: any): PaymentNeededDetails {
  const parsed = paymentNeededDetailsSchema.parse({
    ...data,
    maxAmountRequired: BigInt(data.maxAmountRequired),
  });
  return parsed;
}

export function authorizationParametersToJsonSafe(
  authorizationParameters: AuthorizationParameters
) {
  return {
    ...authorizationParameters,
    value: authorizationParameters.value.toString(),
    validAfter: authorizationParameters.validAfter.toString(),
    validBefore: authorizationParameters.validBefore.toString(),
  };
}

export function authorizationParametersFromObj(
  data: any
): AuthorizationParameters {
  const parsed = authorizationParametersSchema.parse({
    ...data,
    value: BigInt(data.value),
    validAfter: BigInt(data.validAfter),
    validBefore: BigInt(data.validBefore),
  });
  return parsed;
}

export function payloadV1ToJsonSafe(payloadV1: PayloadV1) {
  return {
    ...payloadV1,
    params: authorizationParametersToJsonSafe(payloadV1.params),
  };
}

export function payloadV1FromObj(data: any): PayloadV1 {
  const parsed = payloadV1Schema.parse({
    ...data,
    params: authorizationParametersFromObj(data.params),
  });
  return parsed;
}

export function paymentPayloadV1ToJsonSafe(paymentPayloadV1: PaymentPayloadV1) {
  return {
    ...paymentPayloadV1,
    payload: payloadV1ToJsonSafe(paymentPayloadV1.payload),
  };
}

export function paymentPayloadV1FromObj(data: any): PaymentPayloadV1 {
  const parsed = paymentPayloadV1Schema.parse({
    ...data,
    payload: payloadV1FromObj(data.payload),
  });
  return parsed;
}
