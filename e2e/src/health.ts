import { verboseLog } from './logger';

export interface WaitForHealthOptions {
  maxAttempts?: number;
  intervalMs?: number;
  initialDelayMs?: number;
  label?: string;
}

/**
 * Retry a health-check function until it reports success or attempts are
 * exhausted. Returns true when healthy, false on timeout.
 */
export async function waitForHealth(
  healthCheck: () => Promise<{ success: boolean }>,
  options?: WaitForHealthOptions,
): Promise<boolean> {
  const maxAttempts = options?.maxAttempts ?? 10;
  const intervalMs = options?.intervalMs ?? 2000;
  const initialDelayMs = options?.initialDelayMs ?? 0;
  const label = options?.label ?? 'Service';

  if (initialDelayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, initialDelayMs));
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let result: { success: boolean; error?: string };
    try {
      result = await healthCheck();
    } catch (error) {
      result = { success: false, error: error instanceof Error ? error.message : String(error) };
    }
    const detail = !result.success && result.error ? ` (${result.error})` : '';
    verboseLog(` 🔍 ${label} health check ${attempt}/${maxAttempts}: ${result.success ? '✅' : '❌'}${detail}`);

    if (result.success) {
      verboseLog(`  ✅ ${label} is healthy`);
      return true;
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  verboseLog(`  ❌ ${label} failed to become healthy`);
  return false;
}
