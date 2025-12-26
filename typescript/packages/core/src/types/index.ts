export type {
  VerifyRequest,
  VerifyResponse,
  SettleRequest,
  SettleResponse,
  SupportedResponse,
} from "./facilitator";
export { VerifyError, SettleError } from "./facilitator";
export type { PaymentRequirements, PaymentPayload, PaymentRequired } from "./payments";
export type {
  SchemeNetworkClient,
  SchemeNetworkFacilitator,
  SchemeNetworkServer,
  MoneyParser,
} from "./mechanisms";
export type { PaymentRequirementsV1, PaymentRequiredV1, PaymentPayloadV1 } from "./v1";
export type { ResourceServerExtension } from "./extensions";

export type Network = `${string}:${string}`;

export type Money = string | number;
export type AssetAmount = {
  asset: string;
  amount: string;
  extra?: Record<string, unknown>;
};
export type Price = Money | AssetAmount;
