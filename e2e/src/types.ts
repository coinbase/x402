export type ProtocolFamily = 'evm' | 'svm';

export interface ClientResult {
  success: boolean;
  data?: any;
  status_code?: number;
  payment_response?: any;
  error?: string;
}

export interface ServerConfig {
  port: number;
  useCdpFacilitator: boolean;
  evmPayTo: string;
  svmPayTo: string;
  evmNetwork: string;
  svmNetwork: string;
}

export interface ClientConfig {
  evmPrivateKey: string;
  svmPrivateKey: string;
  serverUrl: string;
  endpointPath: string;
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
  type: 'server' | 'client';
  language: string;
  protocolFamilies?: ProtocolFamily[];
  x402Version?: number; // For servers - single version they implement
  x402Versions?: number[]; // For clients - array of versions they support
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

export interface TestScenario {
  client: DiscoveredClient;
  server: DiscoveredServer;
  endpoint: TestEndpoint;
  protocolFamily: ProtocolFamily;
  facilitatorNetworkCombo: {
    useCdpFacilitator: boolean;
    network: string;
  };
}

export interface ScenarioResult {
  success: boolean;
  error?: string;
  data?: any;
  status_code?: number;
  payment_response?: any;
} 