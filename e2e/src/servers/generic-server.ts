import { BaseProxy, RunConfig } from '../proxy-base';
import { ServerProxy } from '../types';
import { verboseLog, errorLog } from '../logger';
import { getNetwork } from '../networks/networks';

/**
 * Translates v2 CAIP-2 network format to v1 simple format for legacy servers
 * 
 * @param network - Network in CAIP-2 format (e.g., "eip155:84532")
 * @returns Network in v1 format (e.g., "base-sepolia")
 */
function translateNetworkForV1(network: string): string {
  const networkMap: Record<string, string> = {
    'eip155:84532': 'base-sepolia',
    'eip155:8453': 'base',
    'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': 'solana-devnet',
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 'solana-mainnet',
  };

  return networkMap[network] || network;
}

interface ServerConfig {
  port: number;
  evmPayTo: string;
  svmPayTo: string;
  evmNetwork: string;
  svmNetwork: string;
  facilitatorUrl?: string;
}

export interface ProtectedResponse {
  message: string;
  timestamp: string;
}

export interface HealthResponse {
  status: string;
}

export interface CloseResponse {
  message: string;
}

export interface ServerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export class GenericServerProxy extends BaseProxy implements ServerProxy {
  private port: number = 4021;
  private healthEndpoint: string = '/health';
  private closeEndpoint: string = '/close';

  constructor(directory: string) {
    // Use different ready logs for different server types
    const readyLog = directory.includes('next') ? 'Ready' : 'Server listening';
    super(directory, readyLog);

    // Load endpoints from test config
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

        // Load health endpoint
        const healthEndpoint = config.endpoints?.find((endpoint: any) => endpoint.health);
        if (healthEndpoint) {
          this.healthEndpoint = healthEndpoint.path;
        }

        // Load close endpoint
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

  async start(config: ServerConfig): Promise<void> {
    this.port = config.port;

    // Check if this is a v1 (legacy) server based on directory name
    const isV1Server = this.directory.includes('legacy/');

    verboseLog(`  📂 Server directory: ${this.directory}, isV1: ${isV1Server}`);

    // Translate networks to v1 format for legacy servers using getNetwork helper
    let evmNetwork = config.evmNetwork;
    let svmNetwork = config.svmNetwork;

    if (isV1Server) {
      // Use getNetwork to look up and get v1 name
      const evmNetworkInfo = getNetwork(config.evmNetwork);
      const svmNetworkInfo = getNetwork(config.svmNetwork);

      evmNetwork = evmNetworkInfo?.v1Name || translateNetworkForV1(config.evmNetwork);
      svmNetwork = svmNetworkInfo?.v1Name || translateNetworkForV1(config.svmNetwork);

      verboseLog(`  🔄 Translating networks for v1 server: ${config.evmNetwork} → ${evmNetwork}, ${config.svmNetwork} → ${svmNetwork}`);
    }

    const runConfig: RunConfig = {
      port: config.port,
      env: {
        EVM_NETWORK: evmNetwork,
        EVM_PAYEE_ADDRESS: config.evmPayTo,
        SVM_NETWORK: svmNetwork,
        SVM_PAYEE_ADDRESS: config.svmPayTo,
        PORT: config.port.toString(),
        EVM_RPC_URL: getNetwork(config.evmNetwork)?.rpcUrl || '',

        // Use facilitator URL if provided
        FACILITATOR_URL: config.facilitatorUrl || '',
      }
    };

    await this.startProcess(runConfig);
  }

  async protected(): Promise<ServerResult<ProtectedResponse>> {
    try {
      const response = await fetch(`http://localhost:${this.port}/protected`);

      if (!response.ok) {
        return {
          success: false,
          error: `Protected endpoint failed: ${response.status} ${response.statusText}`,
          statusCode: response.status
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data as ProtectedResponse,
        statusCode: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async health(): Promise<ServerResult<HealthResponse>> {
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

  async close(): Promise<ServerResult<CloseResponse>> {
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
        data: data as CloseResponse,
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

  getHealthUrl(): string {
    return `http://localhost:${this.port}${this.healthEndpoint}`;
  }

  getProtectedPath(): string {
    return `/protected`;
  }

  getUrl(): string {
    return `http://localhost:${this.port}`;
  }
} 