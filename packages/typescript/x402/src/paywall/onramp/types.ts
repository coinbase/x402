export interface OnrampConfig {
  apiKeyId: string;
  apiSecretKey: string;
  environment?: "production" | "development";
}

export interface OnrampQuote {
  fiatAmount: string;
  fiatCurrency: string;
  cryptoAmount: string;
  cryptoCurrency: string;
  exchangeRate: string;
  networkFee: string;
  processingFee: string;
  totalFee: string;
}

export interface OnrampSession {
  id: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
  updatedAt: string;
  quote: OnrampQuote;
  paymentMethod: {
    id: string;
    type: string;
  };
  redirectUrl: string;
}

export interface CreateSessionRequest {
  local_currency: string;
  crypto_currency: string;
  requested_currency: string;
  requested_amount: string;
  payment_method?: string;
  wallet_address?: string;
  success_url?: string;
  cancel_url?: string;
  notification_url?: string;
}

export interface OnrampError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
