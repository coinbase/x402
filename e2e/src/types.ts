export interface FacilitatorConfig {
  url: string;
  port: number;
}

export interface ClientResult {
  success: boolean;
  data?: any;
  status_code?: number;
  payment_response?: any;
  error?: string;
}

export interface ServerConfig {
  port: number;
  facilitator: FacilitatorConfig;
  address: string;
}

export interface ClientConfig {
  privateKey: string;
  serverUrl: string;
  endpointPath: string;
}

export interface ServerProxy {
  start(config: ServerConfig): Promise<void>;
  stop(): Promise<void>;
  getHealthUrl(): string;
  getProtectedUrl(): string;
}

export interface ClientProxy {
  call(config: ClientConfig): Promise<ClientResult>;
} 