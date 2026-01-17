import { Request, Response, NextFunction } from "express";
import {
  SIGN_IN_WITH_X,
  parseSIWxHeader,
  validateSIWxMessage,
  verifySIWxSignature,
} from "@x402/extensions/sign-in-with-x";

// Tracks which addresses have paid for which resources
const paidAddresses = new Map<string, Set<string>>();

/**
 * Records that an address has paid for a resource.
 *
 * @param resource - The resource path
 * @param address - The payer's address
 */
export function recordPayment(resource: string, address: string): void {
  if (!paidAddresses.has(resource)) {
    paidAddresses.set(resource, new Set());
  }
  paidAddresses.get(resource)!.add(address.toLowerCase());
  console.log(`Payment recorded: ${address} for ${resource}`);
}

/**
 * Checks if an address has paid for a resource.
 *
 * @param resource - The resource path
 * @param address - The address to check
 * @returns True if the address has paid
 */
export function hasPaid(resource: string, address: string): boolean {
  return paidAddresses.get(resource)?.has(address.toLowerCase()) ?? false;
}

/**
 * Creates SIWX middleware that validates proofs and skips payment for returning users.
 *
 * @param host - The server host (e.g., "localhost:4021")
 * @returns Express middleware function
 */
export function createSIWxMiddleware(host: string) {
  return async function siwxMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = req.headers[SIGN_IN_WITH_X.toLowerCase()] as string | undefined;
    if (!header) {
      next();
      return;
    }

    try {
      const payload = parseSIWxHeader(header);
      const resourceUri = `http://${host}${req.path}`;

      const validation = await validateSIWxMessage(payload, resourceUri);
      if (!validation.valid) {
        next();
        return;
      }

      const verification = await verifySIWxSignature(payload);
      if (!verification.valid || !verification.address) {
        next();
        return;
      }

      if (hasPaid(req.path, verification.address)) {
        console.log(`SIWX auth: ${verification.address} for ${req.path}`);
        res.locals.siwxAddress = verification.address;
        res.locals.siwxAuthenticated = true;
      }
    } catch {
      // Invalid SIWX, fall through to payment
    }

    next();
  };
}
