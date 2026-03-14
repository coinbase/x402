/**
 * Custom error types for x402 payment scenarios
 */

export enum X402ErrorCode {
  NETWORK_ERROR = "NETWORK_ERROR",
  PAYMENT_ERROR = "PAYMENT_ERROR", 
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  INVALID_PAYMENT_SCHEME = "INVALID_PAYMENT_SCHEME",
  SERVER_ERROR = "SERVER_ERROR",
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  RATE_LIMITED = "RATE_LIMITED",
  MALFORMED_RESPONSE = "MALFORMED_RESPONSE",
  TIMEOUT = "TIMEOUT",
  UNKNOWN_ERROR = "UNKNOWN_ERROR"
}

export class X402Error extends Error {
  public readonly code: X402ErrorCode;
  public readonly statusCode?: number;
  public readonly retryable: boolean;
  public readonly paymentAttempted: boolean;
  public readonly originalError?: Error;

  constructor({
    message,
    code,
    statusCode,
    retryable = false,
    paymentAttempted = false,
    originalError,
  }: {
    message: string;
    code: X402ErrorCode;
    statusCode?: number;
    retryable?: boolean;
    paymentAttempted?: boolean;
    originalError?: Error;
  }) {
    super(message);
    this.name = "X402Error";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.paymentAttempted = paymentAttempted;
    this.originalError = originalError;
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      paymentAttempted: this.paymentAttempted,
      stack: this.stack,
    };
  }
}

export class NetworkError extends X402Error {
  constructor(message: string, originalError?: Error) {
    super({
      message,
      code: X402ErrorCode.NETWORK_ERROR,
      retryable: true,
      originalError,
    });
  }
}

export class PaymentError extends X402Error {
  public readonly paymentDetails?: any;

  constructor(message: string, paymentDetails?: any, originalError?: Error) {
    super({
      message,
      code: X402ErrorCode.PAYMENT_ERROR,
      retryable: false,
      paymentAttempted: true,
      originalError,
    });
    this.paymentDetails = paymentDetails;
  }
}

export class InsufficientFundsError extends PaymentError {
  constructor(requiredAmount: string, availableAmount: string) {
    super(
      `Insufficient funds: required ${requiredAmount}, available ${availableAmount}`,
      { requiredAmount, availableAmount }
    );
    this.code = X402ErrorCode.INSUFFICIENT_FUNDS;
  }
}

export class RateLimitError extends X402Error {
  public readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super({
      message,
      code: X402ErrorCode.RATE_LIMITED,
      statusCode: 429,
      retryable: true,
    });
    this.retryAfter = retryAfter;
  }
}

export class ServerError extends X402Error {
  constructor(message: string, statusCode: number, originalError?: Error) {
    super({
      message,
      code: X402ErrorCode.SERVER_ERROR,
      statusCode,
      retryable: statusCode >= 500,
      originalError,
    });
  }
}

/**
 * Helper function to classify HTTP errors into appropriate X402Error types
 */
export function classifyError(error: any): X402Error {
  // Network/connectivity errors
  if (
    error.code === "ENOTFOUND" ||
    error.code === "ECONNREFUSED" ||
    error.code === "ETIMEDOUT"
  ) {
    return new NetworkError(`Network error: ${error.message}`, error);
  }

  // HTTP response errors
  if (error.response) {
    const { status, statusText } = error.response;
    
    if (status === 429) {
      const retryAfter = error.response.headers["retry-after"];
      return new RateLimitError(
        `Rate limited: ${statusText}`,
        retryAfter ? parseInt(retryAfter, 10) : undefined
      );
    }

    if (status === 402) {
      return new PaymentError(`Payment required: ${statusText}`, null, error);
    }

    if (status === 401 || status === 403) {
      return new X402Error({
        message: `Authentication error: ${statusText}`,
        code: X402ErrorCode.AUTHENTICATION_ERROR,
        statusCode: status,
        originalError: error,
      });
    }

    if (status >= 500) {
      return new ServerError(`Server error: ${statusText}`, status, error);
    }

    if (status >= 400) {
      return new X402Error({
        message: `Client error: ${statusText}`,
        code: X402ErrorCode.MALFORMED_RESPONSE,
        statusCode: status,
        originalError: error,
      });
    }
  }

  // Payment-specific errors
  if (error.message?.includes("insufficient funds")) {
    return new InsufficientFundsError("unknown", "unknown");
  }

  if (error.message?.includes("invalid payment scheme")) {
    return new X402Error({
      message: error.message,
      code: X402ErrorCode.INVALID_PAYMENT_SCHEME,
      originalError: error,
    });
  }

  // Generic fallback
  return new X402Error({
    message: error.message || "Unknown error occurred",
    code: X402ErrorCode.UNKNOWN_ERROR,
    originalError: error,
  });
}