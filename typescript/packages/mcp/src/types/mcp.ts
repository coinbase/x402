import type {
  Network,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  Price,
  SettleResponse,
} from "@x402/core/types";
import { isObject } from "../utils/encoding";

/**
 * MCP JSON-RPC error code for payment required (x402)
 */
export const MCP_PAYMENT_REQUIRED_CODE = 402;

/**
 * MCP _meta key for payment payload (client → server)
 */
export const MCP_PAYMENT_META_KEY = "x402/payment";

/**
 * MCP _meta key for payment response (server → client)
 */
export const MCP_PAYMENT_RESPONSE_META_KEY = "x402/payment-response";

/**
 * Dynamic function to resolve payTo address based on tool call context
 */
export type DynamicPayTo = (context: MCPToolContext) => string | Promise<string>;

/**
 * Dynamic function to resolve price based on tool call context
 */
export type DynamicPrice = (context: MCPToolContext) => Price | Promise<Price>;

/**
 * Context provided to dynamic functions and hooks during tool execution
 */
export interface MCPToolContext {
  /** The name of the tool being called */
  toolName: string;
  /** The arguments passed to the tool */
  arguments: Record<string, unknown>;
  /** Optional metadata from the request */
  meta?: Record<string, unknown>;
}

/**
 * Payment configuration for a paid MCP tool
 */
export interface MCPToolPaymentConfig {
  /** Payment scheme identifier (e.g., "exact") */
  scheme: string;

  /** Blockchain network identifier in CAIP-2 format (e.g., "eip155:84532") */
  network: Network;

  /** Price for the tool call (e.g., "$0.10", "1000000") */
  price: Price | DynamicPrice;

  /** Recipient wallet address or dynamic resolver */
  payTo: string | DynamicPayTo;

  /** Maximum time allowed for payment completion in seconds */
  maxTimeoutSeconds?: number;

  /** Scheme-specific additional information */
  extra?: Record<string, unknown>;

  /** Resource metadata for the tool */
  resource?: {
    /** Custom URL for the resource (defaults to mcp://tool/{toolName}) */
    url?: string;
    /** Human-readable description of the tool */
    description?: string;
    /** MIME type of the tool response */
    mimeType?: string;
  };
}

/**
 * Result of processing an MCP tool request for payment
 */
export type MCPPaymentProcessResult =
  | { type: "no-payment-required" }
  | {
      type: "payment-verified";
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    }
  | {
      type: "payment-error";
      error: MCPPaymentError;
    };

/**
 * MCP payment error structure for JSON-RPC error responses
 */
export interface MCPPaymentError {
  /** JSON-RPC error code (402 for payment required) */
  code: number;
  /** Human-readable error message */
  message: string;
  /** PaymentRequired data for 402 errors */
  data?: PaymentRequired;
}

/**
 * Context provided to onPaymentRequired hooks
 */
export interface PaymentRequiredContext {
  /** The tool name that returned 402 */
  toolName: string;
  /** The arguments that were passed to the tool */
  arguments: Record<string, unknown>;
  /** The payment requirements from the server */
  paymentRequired: PaymentRequired;
}

/**
 * Result from onPaymentRequired hook
 */
export interface PaymentRequiredHookResult {
  /** Custom payment payload to use instead of auto-generated */
  payment?: PaymentPayload;
  /** Skip payment and abort the call */
  abort?: boolean;
}

/**
 * Hook called when a 402 response is received, before payment processing.
 * Return payment to use that instead of auto-generating, abort: true to stop.
 * Return void/undefined to proceed with normal payment flow.
 */
export type PaymentRequiredHook = (
  context: PaymentRequiredContext,
) => Promise<PaymentRequiredHookResult | void> | PaymentRequiredHookResult | void;

/**
 * Options for x402MCPClient
 */
export interface x402MCPClientOptions {
  /**
   * Whether to automatically retry tool calls with payment on 402 errors.
   * When true (default), the client will automatically create and submit
   * payment when a 402 error is received.
   * When false, the client will throw the 402 error for manual handling.
   *
   * @default true
   */
  autoPayment?: boolean;

  /**
   * Hook called before automatic payment is submitted.
   * Return true to proceed with payment, false to abort.
   * Only called when autoPayment is true.
   *
   * This can be used to implement human-in-the-loop approval.
   */
  onPaymentApproval?: (context: PaymentApprovalContext) => Promise<boolean> | boolean;
}

/**
 * Context provided to payment approval hook
 */
export interface PaymentApprovalContext {
  /** The tool being called */
  toolName: string;
  /** The arguments passed to the tool */
  arguments: Record<string, unknown>;
  /** The payment requirements from the server */
  paymentRequired: PaymentRequired;
}

// ============================================================================
// Server Hooks
// ============================================================================

/**
 * Context provided to server-side hooks during tool execution
 */
export interface ServerHookContext {
  /** The name of the tool being called */
  toolName: string;
  /** The arguments passed to the tool */
  arguments: Record<string, unknown>;
  /** The resolved payment requirements */
  paymentRequirements: PaymentRequirements;
  /** The payment payload from the client */
  paymentPayload: PaymentPayload;
}

/**
 * Hook called before tool execution (after payment verification)
 * Return false to abort execution and return a 402 error
 */
export type BeforeExecutionHook = (
  context: ServerHookContext,
) => Promise<boolean | void> | boolean | void;

/**
 * Context for after execution hook including the result
 */
export interface AfterExecutionContext extends ServerHookContext {
  /** The tool execution result */
  result: {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  };
}

/**
 * Hook called after tool execution (before settlement)
 */
export type AfterExecutionHook = (context: AfterExecutionContext) => Promise<void> | void;

/**
 * Context for settlement hooks
 */
export interface SettlementContext extends ServerHookContext {
  /** The settlement result */
  settlement: SettleResponse;
}

/**
 * Hook called after successful settlement
 */
export type AfterSettlementHook = (context: SettlementContext) => Promise<void> | void;

/**
 * Tool content item type
 */
export interface ToolContentItem {
  [key: string]: unknown;
  type: string;
  text?: string;
}

/**
 * Result of a tool call that includes payment response metadata
 */
export interface MCPToolResultWithPayment {
  /** Standard MCP tool result content */
  content: ToolContentItem[];
  /** Whether the tool execution resulted in an error */
  isError?: boolean;
  /** Payment response metadata (settlement info) */
  paymentResponse?: SettleResponse;
}

/**
 * MCP metadata with payment
 */
export interface MCPMetaWithPayment {
  [key: string]: unknown;
  [MCP_PAYMENT_META_KEY]?: PaymentPayload;
}

/**
 * MCP request params with optional _meta field for payment
 */
export interface MCPRequestParamsWithMeta {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments?: Record<string, unknown>;
  /** Metadata including potential payment payload */
  _meta?: MCPMetaWithPayment;
}

/**
 * MCP metadata with payment response
 */
export interface MCPMetaWithPaymentResponse {
  [key: string]: unknown;
  [MCP_PAYMENT_RESPONSE_META_KEY]?: SettleResponse;
}

/**
 * MCP result with optional _meta field for payment response
 */
export interface MCPResultWithMeta {
  /** Tool result content */
  content?: ToolContentItem[];
  /** Whether the result is an error */
  isError?: boolean;
  /** Metadata including potential payment response */
  _meta?: MCPMetaWithPaymentResponse;
}

/**
 * MCP JSON-RPC error with payment required data
 */
export interface MCPPaymentRequiredError {
  /** JSON-RPC error code (402) */
  code: typeof MCP_PAYMENT_REQUIRED_CODE;
  /** Error message */
  message: string;
  /** PaymentRequired data */
  data: PaymentRequired;
}

/**
 * Type guard to check if an error is a payment required error
 *
 * @param error - The error to check
 * @returns True if the error is a payment required error
 */
export function isPaymentRequiredError(error: unknown): error is MCPPaymentRequiredError {
  if (!isObject(error)) {
    return false;
  }

  if (error.code !== MCP_PAYMENT_REQUIRED_CODE || typeof error.message !== "string") {
    return false;
  }

  if (!isObject(error.data)) {
    return false;
  }

  return "x402Version" in error.data && "accepts" in error.data;
}
