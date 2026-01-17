import { Network } from "./";

export interface ResourceInfo {
  url: string;
  description: string;
  mimeType: string;
}

export type PaymentRequirements = {
  scheme: string;
  network: Network;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};

export type PaymentRequired = {
  x402Version: number;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
};

export type PaymentPayload = {
  x402Version: number;
  resource: ResourceInfo;
  accepted: PaymentRequirements;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
};

/**
 * Validates a PaymentRequirements object to ensure all required fields are present and valid.
 *
 * @param requirements - The payment requirements to validate
 * @throws Error if validation fails with a descriptive message
 */
export function validatePaymentRequirements(requirements: PaymentRequirements): void {
  if (!requirements.scheme || typeof requirements.scheme !== "string" || requirements.scheme.trim() === "") {
    throw new Error("PaymentRequirements validation failed: scheme is required and must be a non-empty string");
  }

  if (!requirements.network || typeof requirements.network !== "string" || requirements.network.trim() === "") {
    throw new Error("PaymentRequirements validation failed: network is required and must be a non-empty string");
  }

  if (!requirements.asset || typeof requirements.asset !== "string" || requirements.asset.trim() === "") {
    throw new Error("PaymentRequirements validation failed: asset is required and must be a non-empty string");
  }

  if (!requirements.amount || typeof requirements.amount !== "string" || requirements.amount.trim() === "") {
    throw new Error("PaymentRequirements validation failed: amount is required and must be a non-empty string");
  }

  if (!requirements.payTo || typeof requirements.payTo !== "string" || requirements.payTo.trim() === "") {
    throw new Error("PaymentRequirements validation failed: payTo is required and must be a non-empty string");
  }

  if (
    typeof requirements.maxTimeoutSeconds !== "number" ||
    requirements.maxTimeoutSeconds <= 0 ||
    !Number.isInteger(requirements.maxTimeoutSeconds)
  ) {
    throw new Error(
      "PaymentRequirements validation failed: maxTimeoutSeconds is required and must be a positive integer",
    );
  }

  if (!requirements.extra || typeof requirements.extra !== "object" || Array.isArray(requirements.extra)) {
    throw new Error("PaymentRequirements validation failed: extra is required and must be an object");
  }
}

/**
 * Validates a ResourceInfo object to ensure all required fields are present and valid.
 *
 * @param resource - The resource info to validate
 * @throws Error if validation fails with a descriptive message
 */
export function validateResourceInfo(resource: ResourceInfo): void {
  if (!resource.url || typeof resource.url !== "string" || resource.url.trim() === "") {
    throw new Error("ResourceInfo validation failed: url is required and must be a non-empty string");
  }

  if (typeof resource.description !== "string") {
    throw new Error("ResourceInfo validation failed: description is required and must be a string");
  }

  if (typeof resource.mimeType !== "string") {
    throw new Error("ResourceInfo validation failed: mimeType is required and must be a string");
  }
}

/**
 * Validates a PaymentRequired object to ensure all required fields are present and valid.
 *
 * @param paymentRequired - The payment required object to validate
 * @throws Error if validation fails with a descriptive message
 */
export function validatePaymentRequired(paymentRequired: PaymentRequired): void {
  if (
    typeof paymentRequired.x402Version !== "number" ||
    paymentRequired.x402Version < 1 ||
    paymentRequired.x402Version > 2
  ) {
    throw new Error(
      `PaymentRequired validation failed: x402Version is required and must be 1 or 2, got ${paymentRequired.x402Version}`,
    );
  }

  if (!paymentRequired.resource) {
    throw new Error("PaymentRequired validation failed: resource is required");
  }
  validateResourceInfo(paymentRequired.resource);

  if (!Array.isArray(paymentRequired.accepts) || paymentRequired.accepts.length === 0) {
    throw new Error("PaymentRequired validation failed: accepts is required and must be a non-empty array");
  }

  // Validate each payment requirement in the accepts array
  paymentRequired.accepts.forEach((req, index) => {
    try {
      validatePaymentRequirements(req);
    } catch (error) {
      throw new Error(
        `PaymentRequired validation failed: accepts[${index}] is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  // Validate error field if present
  if (paymentRequired.error !== undefined && typeof paymentRequired.error !== "string") {
    throw new Error("PaymentRequired validation failed: error must be a string if provided");
  }

  // Validate extensions if present
  if (
    paymentRequired.extensions !== undefined &&
    (typeof paymentRequired.extensions !== "object" ||
      Array.isArray(paymentRequired.extensions) ||
      paymentRequired.extensions === null)
  ) {
    throw new Error("PaymentRequired validation failed: extensions must be an object if provided");
  }
}
