export type PaymentCreationPhase = "preparation" | "signing" | "validation";

const AA_ERROR_MESSAGES: Record<string, string> = {
  AA10: "Sender already constructed",
  AA13: "InitCode failed or OOG",
  AA14: "InitCode must return sender",
  AA15: "InitCode must create sender",
  AA20: "Account not deployed",
  AA21: "Insufficient funds for gas prefund",
  AA22: "Expired or not due",
  AA23: "Reverted (or OOG)",
  AA24: "Signature validation failed",
  AA25: "Nonce validation failed",
  AA26: "Account accessed global state",
  AA30: "Paymaster not deployed",
  AA31: "Paymaster deposit too low",
  AA32: "Paymaster expired or not due",
  AA33: "Paymaster reverted (or OOG)",
  AA34: "Paymaster context reverted",
  AA40: "Over verification gas limit",
  AA41: "Over max fee per gas",
  AA50: "Over max priority fee per gas",
  AA51: "Prefund below actualGasCost",
};

/**
 * Extracts an AA error code (e.g. "AA21") from an error and returns
 * a human-readable reason. Returns null if no AA code is found.
 *
 * @param error - The error to parse for an AA error code
 * @returns The parsed AA error code and reason, or null if not found
 */
export function parseAAError(error: unknown): { code: string; reason: string } | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\b(AA[0-9]{2})\b/);
  if (!match) return null;
  const code = match[1];
  const reason = AA_ERROR_MESSAGES[code] ?? "Unknown AA error";
  return { code, reason };
}

/**
 * Error thrown during ERC-4337 payment creation, with phase and context information.
 */
export class PaymentCreationError extends Error {
  readonly phase: PaymentCreationPhase;
  readonly reason: string;
  readonly safeAddress?: string;
  readonly network?: string;
  readonly code?: string;
  readonly cause?: unknown;

  /**
   * Creates a new PaymentCreationError.
   *
   * @param message - The error message
   * @param options - Error context options
   * @param options.phase - The phase where the error occurred
   * @param options.reason - The human-readable reason
   * @param options.safeAddress - The Safe address involved, if any
   * @param options.network - The network identifier, if any
   * @param options.code - The AA error code, if any
   * @param options.cause - The underlying cause error, if any
   */
  constructor(
    message: string,
    options: {
      phase: PaymentCreationPhase;
      reason: string;
      safeAddress?: string;
      network?: string;
      code?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "PaymentCreationError";
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
    this.phase = options.phase;
    this.reason = options.reason;
    this.safeAddress = options.safeAddress;
    this.network = options.network;
    this.code = options.code;
  }

  /**
   * Serializes the error to a JSON-safe object.
   *
   * @returns A plain object representation of the error
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      phase: this.phase,
      reason: this.reason,
      ...(this.code && { code: this.code }),
      ...(this.safeAddress && { safeAddress: this.safeAddress }),
      ...(this.network && { network: this.network }),
    };
  }
}
