import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

export function getPrivateKey(cliKey?: string): string | undefined {
  return cliKey || process.env.X402_PRIVATE_KEY;
}

export function getFacilitatorUrl(): string {
  return process.env.X402_FACILITATOR_URL || 'https://x402-facilitator.base.org';
}
