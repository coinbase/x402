import { z } from "zod";
import {
  COLD_START_SIGNAL_CATEGORIES,
  type ColdStartSignal,
  type ColdStartSignalCategory,
  type ColdStartSignals,
  type CategorizedColdStartSignal,
  type SignedColdStartSignal,
} from "./types";

export const ColdStartSignalSchema = z
  .object({
    type: z.string().min(1),
    provider: z.string().min(1).optional(),
    checkedAt: z.string().optional(),
    ttlSeconds: z.number().int().nonnegative().optional(),
    sig: z.string().min(1).optional(),
    kid: z.string().min(1).optional(),
    jwks: z.string().url().optional(),
    alg: z.string().min(1).optional(),
  })
  .passthrough();

export const ColdStartSignalsSchema = z.object({
  onChainCredentials: z.array(ColdStartSignalSchema).optional(),
  onChainActivity: z.array(ColdStartSignalSchema).optional(),
  offChainAttestations: z.array(ColdStartSignalSchema).optional(),
  discoveryAttestations: z.array(ColdStartSignalSchema).optional(),
});

type ColdStartSignalsParseResult =
  | { success: true; data: ColdStartSignals }
  | { success: false; error: string };

/**
 * Parse and normalize a `coldStartSignals` object.
 *
 * Unknown categories are ignored so clients can safely adopt newer categories
 * over time without breaking older SDK versions.
 */
export function parseColdStartSignals(value: unknown): ColdStartSignals {
  const result = safeParseColdStartSignals(value);

  if ("data" in result) {
    return result.data;
  }

  throw new Error(result.error);
}

/**
 * Safe variant of `parseColdStartSignals`.
 */
export function safeParseColdStartSignals(value: unknown): ColdStartSignalsParseResult {
  if (!isRecord(value)) {
    return {
      success: false,
      error: "Invalid coldStartSignals: expected an object",
    };
  }

  const projected = projectKnownCategories(value);
  const parsed = ColdStartSignalsSchema.safeParse(projected);

  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid coldStartSignals: ${formatZodIssues(parsed.error.issues)}`,
    };
  }

  return {
    success: true,
    data: parsed.data as ColdStartSignals,
  };
}

/**
 * Extract cold-start signals from a direct `coldStartSignals` object, an
 * envelope with `coldStartSignals`, or a discovery-style `metadata` object.
 */
export function extractColdStartSignals(value: unknown): ColdStartSignals | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if ("coldStartSignals" in value) {
    if (value.coldStartSignals === undefined) {
      return undefined;
    }

    return parseColdStartSignals(value.coldStartSignals);
  }

  if ("metadata" in value && isRecord(value.metadata) && "coldStartSignals" in value.metadata) {
    if (value.metadata.coldStartSignals === undefined) {
      return undefined;
    }

    return parseColdStartSignals(value.metadata.coldStartSignals);
  }

  if (hasKnownCategory(value)) {
    return parseColdStartSignals(value);
  }

  return undefined;
}

export function isColdStartSignal(value: unknown): value is ColdStartSignal {
  return ColdStartSignalSchema.safeParse(value).success;
}

export function isColdStartSignals(value: unknown): value is ColdStartSignals {
  return safeParseColdStartSignals(value).success;
}

export function isSignedColdStartSignal(value: ColdStartSignal): value is SignedColdStartSignal {
  return (
    typeof value.sig === "string" &&
    value.sig.length > 0 &&
    typeof value.kid === "string" &&
    value.kid.length > 0
  );
}

/**
 * Flatten signals across categories for simple client-side iteration.
 */
export function listColdStartSignals(signals: ColdStartSignals): CategorizedColdStartSignal[] {
  const entries: CategorizedColdStartSignal[] = [];

  for (const category of COLD_START_SIGNAL_CATEGORIES) {
    for (const signal of signals[category] ?? []) {
      entries.push({ category, signal });
    }
  }

  return entries;
}

/**
 * Freshness helper for pre-payment evaluation.
 *
 * - Signals without freshness metadata are treated as usable by this helper.
 * - Signals with only one freshness field are treated as malformed/stale.
 */
export function isColdStartSignalFresh(
  signal: Pick<ColdStartSignal, "checkedAt" | "ttlSeconds">,
  now: Date = new Date(),
): boolean {
  const { checkedAt, ttlSeconds } = signal;
  const hasCheckedAt = typeof checkedAt === "string";
  const hasTtlSeconds = typeof ttlSeconds === "number";

  if (!hasCheckedAt && !hasTtlSeconds) {
    return true;
  }

  if (!hasCheckedAt || !hasTtlSeconds) {
    return false;
  }

  const checkedAtMs = Date.parse(checkedAt);

  if (Number.isNaN(checkedAtMs)) {
    return false;
  }

  return checkedAtMs + ttlSeconds * 1000 >= now.getTime();
}

/**
 * Flatten and retain only signals that are still within their freshness window.
 */
export function getFreshColdStartSignals(
  signals: ColdStartSignals,
  now: Date = new Date(),
): CategorizedColdStartSignal[] {
  return listColdStartSignals(signals).filter(entry => isColdStartSignalFresh(entry.signal, now));
}

function projectKnownCategories(value: Record<string, unknown>): Partial<Record<ColdStartSignalCategory, unknown>> {
  const projected: Partial<Record<ColdStartSignalCategory, unknown>> = {};

  for (const category of COLD_START_SIGNAL_CATEGORIES) {
    if (category in value) {
      projected[category] = value[category];
    }
  }

  return projected;
}

function hasKnownCategory(value: Record<string, unknown>): boolean {
  return COLD_START_SIGNAL_CATEGORIES.some(category => category in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues
    .map(issue => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join(", ");
}
