// Simplify x402-next middleware handler signature to avoid NextRequest type version mismatches
declare module "x402-next" {
  import type { Address } from "viem";
  import type { Address as SolanaAddress } from "@solana/kit";
  import type {
    RoutesConfig,
    PaywallConfig,
    FacilitatorConfig,
  } from "x402/types/shared/middleware";
  export type { Resource, Network } from "x402/types/shared/middleware";

  export function paymentMiddleware(
    payTo: Address | SolanaAddress,
    routes: RoutesConfig,
    facilitator?: FacilitatorConfig,
    paywall?: PaywallConfig,
  ): (request: Request) => Promise<Response> | Response;
}


