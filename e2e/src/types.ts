import type { NetworkSet } from './networks/networks';

export type ProtocolFamily = 'evm' | 'svm' | 'aptos';
export type Transport = 'http' | 'mcp';
export type TransferMethod = 'eip3009' | 'permit2';

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
  aptosPrivateKey: string;
  serverUrl: string;
  endpointPath: string;
}

export interface ServerConfig {
  port: number;
  evmPayTo: string;
  svmPayTo: string;
  aptosPayTo: string;
  networks: NetworkSet;
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

export interface TestEndpoint {
  path: string;
  method: string;
  description: string;
  requiresPayment?: boolean;
  protocolFamily?: ProtocolFamily;
  transferMethod?: TransferMethod;
  health?: boolean;
  close?: boolean;
}

export interface TestConfig {
  name: string;
  type: 'server' | 'client' | 'facilitator';
  transport?: Transport;
  language: string;
  protocolFamilies?: ProtocolFamily[];
  x402Version?: number;
  x402Versions?: number[];
  extensions?: string[];
  evm?: {
    transferMethods: TransferMethod[];
  };
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
}

export interface ScenarioResult {
  success: boolean;
  error?: string;
  data?: any;
  status_code?: number;
  payment_response?: any;
}
