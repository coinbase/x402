type SettlementOverrideEndpoint = {
  settlementOverride?: { amount: string };
};

type SettlementResponse = {
  amount?: string | number | bigint | null;
} | null | undefined;

function normalizeDecimalAmount(value: string | number | bigint): string | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return undefined;
  }
  return BigInt(value).toString(10);
}

export function validateSettlementOverrideAmount(
  endpoint: SettlementOverrideEndpoint,
  paymentResponse: SettlementResponse,
): string | undefined {
  const expectedAmount = endpoint.settlementOverride?.amount;
  if (expectedAmount === undefined) {
    return undefined;
  }

  const actualAmount = paymentResponse?.amount;
  if (actualAmount === undefined || actualAmount === null) {
    return `Settlement override amount missing from payment response: expected ${expectedAmount}`;
  }

  const normalizedExpected = normalizeDecimalAmount(expectedAmount);
  const normalizedActual = normalizeDecimalAmount(actualAmount);
  if (normalizedExpected === undefined || normalizedActual === undefined) {
    return `Settlement override amount must be a decimal string: expected ${JSON.stringify(expectedAmount)}, got ${JSON.stringify(actualAmount)}`;
  }
  if (normalizedExpected !== normalizedActual) {
    return `Settlement override amount mismatch: expected ${normalizedExpected}, got ${normalizedActual}`;
  }
  return undefined;
}
