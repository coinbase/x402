/**
 * x402 Facilitator (SERVER-ONLY)
 *
 * This module contains server-side facilitator code for x402 payment verification
 * and settlement. This code is NOT included in browser builds (IIFE).
 *
 * Import via: import { ... } from "x402/facilitator"
 *
 * IMPORTANT:
 * - Only use in Node.js/server environments
 * - Contains RPC helpers, Borsh encoding/decoding, transaction building
 * - Requires secrets (relayer keys) - never expose to browser
 * - IIFE build does NOT bundle this path
 *
 * Future: May be split into @x402/facilitator package for clearer separation
 */

export * from "./facilitator";
