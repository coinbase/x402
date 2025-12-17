export type ProtocolFamily = 'evm' | 'svm';

export interface ClientResult {
  success: boolean;
  data?: any;
  status_code?: number;
  payment_response?: any;
  error?: string;
}

export interface ClientConfig {
  evmPrivateKey: string;
  svmPrivateKey: string;
  serverUrl: string;
  endpointPath: string;
}

export interface ServerConfig {
  port: number;
  evmPayTo: string;
  svmPayTo: string;
  evmNetwork: string;
  svmNetwork: string;
  facilitatorUrl?: string;
}

export interface ServerProxy {
  start(config: ServerConfig): Promise<void>;
  stop(): Promise<void>;
  getHealthUrl(): string;
  getProtectedPath(): string;
  getUrl(): string;
}

export interface ClientProxy {
  call(config: ClientConfig): Promise<ClientResult>;
}

// New types for dynamic discovery
export interface TestEndpoint {
  path: string;
  method: string;
  description: string;
  requiresPayment?: boolean;
  protocolFamily?: ProtocolFamily;
  networks?: string[];
  health?: boolean;
  close?: boolean;
}

export interface TestConfig {
  name: string;
  type: 'server' | 'client' | 'facilitator';
  language: string;
  protocolFamilies?: ProtocolFamily[];
  x402Version?: number; // For servers - single version they implement
  x402Versions?: number[]; // For clients and facilitators - array of versions they support
  extensions?: string[]; // Protocol extensions supported (e.g., ["bazaar"])
  endpoints?: TestEndpoint[];
  supportedMethods?: string[];
  capabilities?: {
    payment?: boolean;
    authentication?: boolean;
  };
  environment: {
    required: string[];
    optional: string[];
  };
}

export interface DiscoveredServer {
  name: string;
  directory: string;
  config: TestConfig;
  proxy: ServerProxy;
}

export interface DiscoveredClient {
  name: string;
  directory: string;
  config: TestConfig;
  proxy: ClientProxy;
}

export interface FacilitatorProxy {
  start(config: any): Promise<void>;
  stop(): Promise<void>;
  getUrl(): string;
}

export interface DiscoveredFacilitator {
  name: string;
  directory: string;
  config: TestConfig;
  proxy: FacilitatorProxy;
  isExternal?: boolean;
}

export interface TestScenario {
  client: DiscoveredClient;
  server: DiscoveredServer;
  facilitator?: DiscoveredFacilitator;
  endpoint: TestEndpoint;
  protocolFamily: ProtocolFamily;
  facilitatorNetworkCombo: {
    useCdpFacilitator: boolean;
    network: string;
    facilitatorUrl?: string;
  };
}

export interface ScenarioResult {
  success: boolean;
  error?: string;
  data?: any;
  status_code?: number;
  payment_response?: any;
} 