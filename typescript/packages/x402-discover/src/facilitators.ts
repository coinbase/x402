// Known x402 facilitators with discovery endpoints
export interface Facilitator {
  id: string;
  name: string;
  url: string;
  listEndpoint?: string; // defaults to /discovery/resources
  status: "active" | "degraded" | "unknown";
  lastChecked?: number;
  lastError?: string;
}

export const facilitators: Facilitator[] = [
  {
    id: "coinbase",
    name: "Coinbase",
    url: "https://x402.org/facilitator",
    status: "active",
  },
  {
    id: "thirdweb",
    name: "Thirdweb",
    url: "https://api.thirdweb.com/v1/payments/x402",
    status: "active",
  },
  {
    id: "heurist",
    name: "Heurist",
    url: "https://facilitator.heurist.xyz",
    status: "active",
  },
  {
    id: "aurracloud",
    name: "AurraCloud",
    url: "https://aurracloud.com/x402",
    status: "unknown",
  },
  {
    id: "questflow",
    name: "Questflow",
    url: "https://api.questflow.ai/x402",
    status: "unknown",
  },
  {
    id: "daydreams",
    name: "Daydreams",
    url: "https://router.daydreams.systems",
    status: "unknown",
  },
  // Known dead/unreachable - kept for reference but marked degraded
  // {
  //   id: "payai",
  //   name: "PayAI",
  //   url: "https://api.payai.network",
  //   status: "degraded",
  //   lastError: "DNS resolution failed",
  // },
  // {
  //   id: "corbits",
  //   name: "Corbits",
  //   url: "https://corbits.xyz/facilitator",
  //   status: "degraded",
  //   lastError: "DNS resolution failed",
  // },
];
