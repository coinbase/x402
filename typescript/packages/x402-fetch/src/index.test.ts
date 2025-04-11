import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchWithPayment } from './index'
import { evm, PaymentRequirements } from 'x402/types'

vi.mock('x402/client', () => ({
  createPaymentHeader: vi.fn()
}))

type RequestInitWithRetry = RequestInit & { __is402Retry?: boolean }

describe('fetchWithPayment()', () => {
  let mockFetch: typeof globalThis.fetch
  let mockWalletClient: typeof evm.SignerWallet
  let wrappedFetch: ReturnType<typeof fetchWithPayment>
  const validPaymentRequirements: PaymentRequirements = {
    scheme: 'exact',
    network: 'base-sepolia',
    maxAmountRequired: '100000', // 0.1 USDC in base units
    resource: 'https://api.example.com/resource',
    description: 'Test payment',
    mimeType: 'application/json',
    payTo: '0x1234567890123456789012345678901234567890',
    maxTimeoutSeconds: 300,
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // USDC on base-sepolia
  }

  const createResponse = (status: number, data?: any): Response => {
    const response = new Response(JSON.stringify(data), {
      status,
      statusText: status === 402 ? 'Payment Required' : 'Not Found',
      headers: new Headers()
    })
    return response
  }

  beforeEach(() => {
    vi.resetAllMocks()

    mockFetch = vi.fn() as any

    mockWalletClient = {
      signMessage: vi.fn()
    } as unknown as typeof evm.SignerWallet

    wrappedFetch = fetchWithPayment(mockFetch, mockWalletClient)
  })

  it('should return the original response for non-402 status codes', async () => {
    const successResponse = createResponse(200, { data: 'success' });
    (mockFetch as any).mockResolvedValue(successResponse);

    const result = await wrappedFetch('https://api.example.com')

    expect(result).toBe(successResponse)
    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com', undefined)
  })

  it('should handle 402 errors and retry with payment header', async () => {
    const paymentHeader = 'payment-header-value'
    const successResponse = createResponse(200, { data: 'success' })

    const { createPaymentHeader } = await import('x402/client');
    (createPaymentHeader as any).mockResolvedValue(paymentHeader);
    (mockFetch as any)
      .mockResolvedValueOnce(createResponse(402, { paymentRequirements: validPaymentRequirements }))
      .mockResolvedValueOnce(successResponse);

    const result = await wrappedFetch('https://api.example.com', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    } as RequestInitWithRetry)

    expect(result).toBe(successResponse)
    expect(createPaymentHeader).toHaveBeenCalledWith(mockWalletClient, validPaymentRequirements)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenLastCalledWith('https://api.example.com', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': paymentHeader,
        'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE'
      },
      __is402Retry: true
    } as RequestInitWithRetry)
  })

  it('should not retry if already retried', async () => {
    const errorResponse = createResponse(402, { paymentRequirements: validPaymentRequirements });
    (mockFetch as any).mockResolvedValue(errorResponse);

    await expect(wrappedFetch('https://api.example.com', {
      __is402Retry: true
    } as RequestInitWithRetry)).rejects.toThrow('Payment already attempted')
  })

  it('should reject if missing request config', async () => {
    const errorResponse = createResponse(402, { paymentRequirements: validPaymentRequirements });
    (mockFetch as any).mockResolvedValue(errorResponse);

    await expect(wrappedFetch('https://api.example.com')).rejects.toThrow('Missing fetch request configuration')
  })

  it('should reject if payment amount exceeds maximum', async () => {
    const errorResponse = createResponse(402, {
      paymentRequirements: {
        ...validPaymentRequirements,
        maxAmountRequired: '200000' // 0.2 USDC, which exceeds our default max of 0.1 USDC
      }
    });
    (mockFetch as any).mockResolvedValue(errorResponse);

    await expect(wrappedFetch('https://api.example.com', {
      method: 'GET'
    } as RequestInitWithRetry)).rejects.toThrow('Payment amount exceeds maximum allowed')
  })

  it('should reject if payment header creation fails', async () => {
    const paymentError = new Error('Payment failed');
    const { createPaymentHeader } = await import('x402/client');
    (createPaymentHeader as any).mockRejectedValue(paymentError);
    (mockFetch as any).mockResolvedValue(createResponse(402, { paymentRequirements: validPaymentRequirements }));

    await expect(wrappedFetch('https://api.example.com', {
      method: 'GET'
    } as RequestInitWithRetry)).rejects.toBe(paymentError)
  })
})