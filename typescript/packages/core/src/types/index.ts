export type {
  VerifyRequest,
  VerifyResponse,
  SettleRequest,
  SettleResponse,
  SupportedResponse,
} from "./facilitator";
export type { PaymentRequirements, PaymentPayload, PaymentRequired } from "./payments";
export type {
  SchemeNetworkClient,
  SchemeNetworkFacilitator,
  SchemeNetworkService,
} from "./mechanisms";

export type Network = `${string}:${string}`;

export type Money = string | number;
export type AssetAmount = {
  asset: string;
  amount: string;
  extra?: Record<string, unknown>;
};
export type Price = Money | AssetAmount;
