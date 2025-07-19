import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signCustomTransaction } from './signCustomTransaction';
import { createPaymentHeader } from './createPaymentHeader';
import { processPriceToAtomicAmount } from '../shared';
import { SignerWallet } from '../types/shared/evm';
import { Network } from '../types';

vi.mock('./createPaymentHeader');
vi.mock('../shared');

describe('signCustomTransaction', () => {
  const mockBuyerWallet = { address: '0xBuyer' } as SignerWallet;
  const mockNetwork = 'testnet' as Network;
  const mockSellerWalletAddress = '0xSeller';
  const mockResource = 'test://resource' as `${string}://${string}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a payment header string on success', async () => {
    (processPriceToAtomicAmount as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      maxAmountRequired: '1000',
      asset: { address: '0xAsset', eip712: {} },
    });
    (createPaymentHeader as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('header123');

    const result = await signCustomTransaction(
      10,
      mockSellerWalletAddress,
      mockResource,
      mockBuyerWallet,
      mockNetwork
    );
    expect(result).toBe('header123');
    expect(processPriceToAtomicAmount).toHaveBeenCalled();
    expect(createPaymentHeader).toHaveBeenCalled();
  });

  it('should return error message if processPriceToAtomicAmount returns error', async () => {
    (processPriceToAtomicAmount as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ error: 'Invalid amount' });
    const result = await signCustomTransaction(
      10,
      mockSellerWalletAddress,
      mockResource,
      mockBuyerWallet,
      mockNetwork
    );
    expect(result).toBe('Invalid amount');
    expect(createPaymentHeader).not.toHaveBeenCalled();
  });

  it('should return error message if createPaymentHeader throws', async () => {
    (processPriceToAtomicAmount as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      maxAmountRequired: '1000',
      asset: { address: '0xAsset', eip712: {} },
    });
    (createPaymentHeader as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Header failed'));
    const result = await signCustomTransaction(
      10,
      mockSellerWalletAddress,
      mockResource,
      mockBuyerWallet,
      mockNetwork
    );
    expect(result).toBe('Header failed');
  });
}); 