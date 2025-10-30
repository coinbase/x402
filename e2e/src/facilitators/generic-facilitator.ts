import { BaseProxy, RunConfig } from '../proxy-base';
import { verboseLog, errorLog } from '../logger';

export interface VerifyRequest {
  x402Version: number;
  paymentPayload: any;
  paymentRequirements: any;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleRequest {
  x402Version: number;
  paymentPayload: any;
  paymentRequirements: any;
}

export interface SettleResponse {
  success: boolean;
  transaction?: string;
  errorReason?: string;
  network?: string;
  payer?: string;
}

export interface SupportedResponse {
  kinds: Array<{
    x402Version: number;
    scheme: string;
    network: string;
    extra?: Record<string, any>;
  }>;
  extensions: any[];
}

export interface HealthResponse {
  status: string;
}

export interface FacilitatorResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export interface FacilitatorConfig {
  port: number;
  evmPrivateKey?: string;
  svmPrivateKey?: string;
  evmNetwork?: string;
  svmNetwork?: string;
}

export interface FacilitatorProxy {
  start(config: FacilitatorConfig): Promise<void>;
  stop(): Promise<void>;
  verify(request: VerifyRequest): Promise<FacilitatorResult<VerifyResponse>>;
  settle(request: SettleRequest): Promise<FacilitatorResult<SettleResponse>>;
  getSupported(): Promise<FacilitatorResult<SupportedResponse>>;
  health(): Promise<FacilitatorResult<HealthResponse>>;
  getUrl(): string;
}

export class GenericFacilitatorProxy extends BaseProxy implements FacilitatorProxy {
  private port: number = 4022;
  private healthEndpoint: string = '/health';
  private closeEndpoint: string = '/close';

  constructor(directory: string) {
    // Facilitators should log when ready
    super(directory, 'Facilitator listening');
    this.loadEndpoints();
  }

  private loadEndpoints(): void {
    try {
      const { readFileSync, existsSync } = require('fs');
      const { join } = require('path');
      const configPath = join(this.directory, 'test.config.json');

      if (existsSync(configPath)) {
        const configContent = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        // Load health endpoint if specified
        const healthEndpoint = config.endpoints?.find((endpoint: any) => endpoint.health);
        if (healthEndpoint) {
          this.healthEndpoint = healthEndpoint.path;
        }

        // Load close endpoint if specified
        const closeEndpoint = config.endpoints?.find((endpoint: any) => endpoint.close);
        if (closeEndpoint) {
          this.closeEndpoint = closeEndpoint.path;
        }
      }
    } catch (error) {
      // Fallback to defaults if config loading fails
      errorLog(`Failed to load endpoints from config for ${this.directory}, using defaults`);
    }
  }

  async start(config: FacilitatorConfig): Promise<void> {
    this.port = config.port;

    const runConfig: RunConfig = {
      port: config.port,
      env: {
        PORT: config.port.toString(),
        EVM_PRIVATE_KEY: config.evmPrivateKey || '',
        SVM_PRIVATE_KEY: config.svmPrivateKey || '',
        EVM_NETWORK: config.evmNetwork || 'eip155:84532',
        SVM_NETWORK: config.svmNetwork || 'solana:devnet',
        EVM_RPC_URL: process.env.BASE_SEPOLIA_RPC_URL || process.env.EVM_RPC_URL || '',
      }
    };

    await this.startProcess(runConfig);
  }

  async verify(request: VerifyRequest): Promise<FacilitatorResult<VerifyResponse>> {
    try {
      const response = await fetch(`http://localhost:${this.port}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Verify failed: ${response.status} ${response.statusText}`,
          statusCode: response.status
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data as VerifyResponse,
        statusCode: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async settle(request: SettleRequest): Promise<FacilitatorResult<SettleResponse>> {
    try {
      const response = await fetch(`http://localhost:${this.port}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Settle failed: ${response.status} ${response.statusText}`,
          statusCode: response.status
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data as SettleResponse,
        statusCode: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async getSupported(): Promise<FacilitatorResult<SupportedResponse>> {
    try {
      const response = await fetch(`http://localhost:${this.port}/supported`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Get supported failed: ${response.status} ${response.statusText}`,
          statusCode: response.status
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data as SupportedResponse,
        statusCode: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async health(): Promise<FacilitatorResult<HealthResponse>> {
    try {
      const response = await fetch(`http://localhost:${this.port}${this.healthEndpoint}`);

      if (!response.ok) {
        return {
          success: false,
          error: `Health check failed: ${response.status} ${response.statusText}`,
          statusCode: response.status
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data as HealthResponse,
        statusCode: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async close(): Promise<FacilitatorResult<{ message: string }>> {
    try {
      const response = await fetch(`http://localhost:${this.port}${this.closeEndpoint}`, {
        method: 'POST'
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Close failed: ${response.status} ${response.statusText}`,
          statusCode: response.status
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data as { message: string },
        statusCode: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      try {
        // Try graceful shutdown via POST /close
        const closeResult = await this.close();
        if (closeResult.success) {
          // Wait a bit for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          verboseLog('Graceful shutdown failed, using force kill');
        }
      } catch (error) {
        verboseLog('Graceful shutdown failed, using force kill');
      }
    }

    await this.stopProcess();
  }

  getUrl(): string {
    return `http://localhost:${this.port}`;
  }
}
