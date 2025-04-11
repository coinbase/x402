import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withPaymentInterceptor } from './index'
import { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig, AxiosHeaders } from 'axios'
import { evm, PaymentRequirements } from 'x402/types'

// Mock the createPaymentHeader function
vi.mock('x402/client', () => ({
  createPaymentHeader: vi.fn() as any
}))

describe('withPaymentInterceptor()', () => {
  let mockAxiosClient: AxiosInstance
  let mockWalletClient: typeof evm.SignerWallet
  let interceptor: (error: AxiosError) => Promise<any>
  const validPaymentRequirements: PaymentRequirements = {
    scheme: 'exact',
    network: 'base-sepolia',
    maxAmountRequired: '1000000', // 1 USDC in base units
    resource: 'https://api.example.com/resource',
    description: 'Test payment',
    mimeType: 'application/json',
    payTo: '0x1234567890123456789012345678901234567890',
    maxTimeoutSeconds: 300,
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // USDC on base-sepolia
  }

  const createErrorConfig = (isRetry = false): InternalAxiosRequestConfig => ({
    headers: new AxiosHeaders(),
    url: 'https://api.example.com',
    method: 'GET',
    ...(isRetry ? { __is402Retry: true } : {})
  } as InternalAxiosRequestConfig)

  const createAxiosError = (status: number, config?: InternalAxiosRequestConfig, data?: any): AxiosError => {
    const error = new AxiosError('Error', 'ERROR', config, {}, {
      status,
      statusText: status === 402 ? 'Payment Required' : 'Not Found',
      data,
      headers: {},
      config: config || createErrorConfig()
    })
    return error
  }

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks()

    // Mock axios client
    mockAxiosClient = {
      interceptors: {
        response: {
          use: vi.fn()
        }
      },
      request: vi.fn()
    } as unknown as AxiosInstance

    // Mock wallet client
    mockWalletClient = {
      signMessage: vi.fn()
    } as unknown as typeof evm.SignerWallet

    // Set up the interceptor
    withPaymentInterceptor(mockAxiosClient, mockWalletClient)
    interceptor = (mockAxiosClient.interceptors.response.use as any).mock.calls[0][1]
  })

  it('should return the axios client instance', () => {
    const result = withPaymentInterceptor(mockAxiosClient, mockWalletClient)
    expect(result).toBe(mockAxiosClient)
  })

  it('should set up response interceptor', () => {
    expect(mockAxiosClient.interceptors.response.use).toHaveBeenCalled()
  })

  it('should not handle non-402 errors', async () => {
    const error = createAxiosError(404)
    await expect(interceptor(error)).rejects.toBe(error)
  })

  it('should handle 402 errors and retry with payment header', async () => {
    const paymentHeader = 'payment-header-value'
    const successResponse = { data: 'success' } as AxiosResponse

    const { createPaymentHeader } = await import('x402/client');
    (createPaymentHeader as any).mockResolvedValue(paymentHeader);
    (mockAxiosClient.request as any).mockResolvedValue(successResponse);

    const error = createAxiosError(402, createErrorConfig(), { paymentRequirements: validPaymentRequirements })

    const result = await interceptor(error)

    expect(result).toBe(successResponse)
    expect(createPaymentHeader).toHaveBeenCalledWith(mockWalletClient, validPaymentRequirements)
    expect(mockAxiosClient.request).toHaveBeenCalledWith({
      ...error.config,
      headers: new AxiosHeaders({
        'X-PAYMENT': paymentHeader,
        'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE'
      }),
      __is402Retry: true
    })
  })

  it('should not retry if already retried', async () => {
    const error = createAxiosError(402, createErrorConfig(true), { paymentRequirements: validPaymentRequirements })
    await expect(interceptor(error)).rejects.toBe(error)
  })

  it('should reject if missing request config', async () => {
    const error = createAxiosError(402, undefined, { paymentRequirements: validPaymentRequirements })
    await expect(interceptor(error)).rejects.toThrow('Missing axios request configuration')
  })

  it('should reject if payment header creation fails', async () => {
    const paymentError = new Error('Payment failed');
    const { createPaymentHeader } = await import('x402/client');
    (createPaymentHeader as any).mockRejectedValue(paymentError);

    const error = createAxiosError(402, createErrorConfig(), { paymentRequirements: validPaymentRequirements })
    await expect(interceptor(error)).rejects.toBe(paymentError)
  })
})