/**
 * Type definitions for the Payment-Identifier Extension
 *
 * Enables clients to provide an idempotency key that resource servers
 * can use for deduplication of payment requests.
 */

/**
 * Extension identifier constant for the payment-identifier extension
 */
export const PAYMENT_IDENTIFIER = "payment-identifier";

/**
 * Minimum length for payment identifier
 */
export const PAYMENT_ID_MIN_LENGTH = 16;

/**
 * Maximum length for payment identifier
 */
export const PAYMENT_ID_MAX_LENGTH = 128;

/**
 * Pattern for valid payment identifier characters (alphanumeric, hyphens, underscores)
 */
export const PAYMENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Payment identifier info containing the client-provided ID
 */
export interface PaymentIdentifierInfo {
  /**
   * Client-provided unique identifier for idempotency.
   * Must be 16-128 characters, alphanumeric with hyphens and underscores allowed.
   */
  id: string;
}

/**
 * Payment identifier extension with info and schema
 */
export interface PaymentIdentifierExtension {
  /**
   * The actual payment identifier data
   */
  info: PaymentIdentifierInfo;

  /**
   * JSON Schema validating the info structure
   */
  schema: PaymentIdentifierSchema;
}

/**
 * Server-side declaration (empty info, just schema)
 */
export interface PaymentIdentifierDeclaration {
  /**
   * Empty info object - clients will populate with their ID
   */
  info: Record<string, never>;

  /**
   * JSON Schema for validating client-provided IDs
   */
  schema: PaymentIdentifierSchema;
}

/**
 * JSON Schema type for the payment-identifier extension
 */
export interface PaymentIdentifierSchema {
  $schema: "https://json-schema.org/draft/2020-12/schema";
  type: "object";
  properties: {
    id: {
      type: "string";
      minLength: number;
      maxLength: number;
      pattern: string;
    };
  };
  required: ["id"];
}
