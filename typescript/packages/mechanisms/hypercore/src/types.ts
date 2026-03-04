export interface HypercoreSendAssetAction {
  type: "sendAsset";
  hyperliquidChain: "Mainnet" | "Testnet";
  signatureChainId: string;
  destination: string;
  sourceDex: "spot" | "perp";
  destinationDex: "spot" | "perp";
  token: string;
  amount: string;
  fromSubAccount: string;
  nonce: number;
}

export interface HypercorePaymentPayload {
  action: HypercoreSendAssetAction;
  signature: {
    r: string;
    s: string;
    v: number;
  };
  nonce: number;
}

export interface HyperliquidApiResponse {
  status: "ok" | "err";
  response?: {
    type: string;
    data?: unknown;
  };
}
