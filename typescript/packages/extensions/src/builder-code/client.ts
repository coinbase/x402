/**
 * Client-side extension for the Builder Code Extension.
 *
 * Attaches the client's service code (`s`) to the payment payload.
 */

import type { ClientExtension } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import { BUILDER_CODE, BUILDER_CODE_PATTERN } from "./types";

/**
 * Client extension that adds builder-code attribution to payment payloads.
 *
 * @example
 * ```typescript
 * import { BuilderCodeClientExtension } from '@x402/extensions/builder-code';
 *
 * const client = new x402Client();
 * client.registerExtension(new BuilderCodeClientExtension("bc_my_client"));
 * ```
 */
export class BuilderCodeClientExtension implements ClientExtension {
  readonly key = BUILDER_CODE;
  private readonly serviceCode: string;

  /**
   * Creates a client extension that attaches the given service code to payments.
   *
   * @param serviceCode - Client service code (`s`), 1-32 lowercase alphanumeric/underscore characters
   */
  constructor(serviceCode: string) {
    if (!BUILDER_CODE_PATTERN.test(serviceCode)) {
      throw new Error(
        `Invalid builder code: "${serviceCode}". ` +
          `Must be 1-32 characters, lowercase alphanumeric and underscores only.`,
      );
    }
    this.serviceCode = serviceCode;
  }

  /**
   * Attaches this client's service code (`s`).
   *
   * @param payload - Payment payload to enrich
   * @param _ - Server payment requirements; core merges server extension data
   * @returns Payment payload with builder-code extension data
   */
  async enrichPaymentPayload(payload: PaymentPayload, _: PaymentRequired): Promise<PaymentPayload> {
    return {
      ...payload,
      extensions: {
        ...payload.extensions,
        [BUILDER_CODE]: { info: { s: this.serviceCode } },
      },
    };
  }
}
