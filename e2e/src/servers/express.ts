import { spawn, ChildProcess } from 'child_process';
import { ServerProxy, ServerConfig } from '../types';

export class ExpressServerProxy implements ServerProxy {
  private process: ChildProcess | null = null;
  private port: number = 4021;

  async start(config: ServerConfig): Promise<void> {
    this.port = config.port;

    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        FACILITATOR_URL: config.facilitator.url,
        ADDRESS: config.address,
        PORT: config.port.toString()
      };

      this.process = spawn('pnpm', ['dev'], {
        env,
        stdio: 'pipe',
        cwd: 'servers/express'
      });

      let output = '';
      this.process.stdout?.on('data', (data) => {
        output += data.toString();
        if (output.includes('Server listening')) {
          resolve();
        }
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`Express server stderr: ${data.toString()}`);
      });

      this.process.on('error', (error) => {
        console.error('Express server error:', error);
        reject(error);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          resolve();
        }
      }, 30000);
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);

      this.process = null;
    }
  }

  getHealthUrl(): string {
    return `http://localhost:${this.port}/health`;
  }

  getProtectedUrl(): string {
    return `http://localhost:${this.port}/protected`;
  }
} 