import { describe, expect, it } from 'vitest';
import { validateSettlementOverrideAmount } from './settlement';

describe('validateSettlementOverrideAmount', () => {
  it('accepts matching decimal amounts after normalization', () => {
    expect(
      validateSettlementOverrideAmount(
        { settlementOverride: { amount: '001000' } },
        { amount: '1000' },
      ),
    ).toBeUndefined();
  });

  it('rejects a different settlement amount', () => {
    expect(
      validateSettlementOverrideAmount(
        { settlementOverride: { amount: '1000' } },
        { amount: '999' },
      ),
    ).toBe('Settlement override amount mismatch: expected 1000, got 999');
  });

  it('rejects non-decimal settlement amounts', () => {
    expect(
      validateSettlementOverrideAmount(
        { settlementOverride: { amount: '1000' } },
        { amount: 1000 },
      ),
    ).toBe(
      'Settlement override amount must be a decimal string: expected "1000", got 1000',
    );
  });

  it('rejects responses that do not carry an amount', () => {
    expect(
      validateSettlementOverrideAmount(
        { settlementOverride: { amount: '1000' } },
        {},
      ),
    ).toBe('Settlement override amount missing from payment response: expected 1000');
  });

  it('skips amount validation when the endpoint has no settlement override', () => {
    expect(
      validateSettlementOverrideAmount(
        {},
        {},
      ),
    ).toBeUndefined();
  });
});
