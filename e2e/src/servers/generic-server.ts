import { BaseProxy, RunConfig } from '../proxy-base';
import { ServerProxy, ServerConfig } from '../types';

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
      console.warn(`Failed to load endpoints from config for ${this.directory}, using defaults`);
    }
  }

  async start(config: ServerConfig): Promise<void> {
    this.port = config.port;

    const runConfig: RunConfig = {
      port: config.port,
      env: {
        USE_CDP_FACILITATOR: config.useCdpFacilitator.toString(),
        CDP_API_KEY_ID: process.env.CDP_API_KEY_ID || '',
        CDP_API_KEY_SECRET: process.env.CDP_API_KEY_SECRET || '',
        NETWORK: config.network,
        ADDRESS: config.payTo,
        PORT: config.port.toString()
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
          console.log('Graceful shutdown failed, using force kill');
        }
      } catch (error) {
        console.log('Graceful shutdown failed, using force kill');
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