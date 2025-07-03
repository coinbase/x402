import { spawn } from 'child_process';
import { ClientProxy, ClientConfig, ClientResult } from '../types';

export class AxiosClientProxy implements ClientProxy {
  async call(config: ClientConfig): Promise<ClientResult> {
    return new Promise((resolve) => {
      const env = {
        ...process.env,
        PRIVATE_KEY: config.privateKey,
        RESOURCE_SERVER_URL: config.serverUrl,
        ENDPOINT_PATH: config.endpointPath
      };

      const childProcess = spawn('pnpm', ['dev'], {
        env,
        stdio: 'pipe',
        cwd: 'clients/axios'
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // Find the JSON result in stdout
            const lines = stdout.split('\n');
            const jsonLine = lines.find(line => line.trim().startsWith('{'));
            if (jsonLine) {
              const result = JSON.parse(jsonLine);
              resolve(result);
            } else {
              resolve({
                success: false,
                error: 'No JSON result found in output'
              });
            }
          } catch (error) {
            resolve({
              success: false,
              error: `Failed to parse result: ${error}`
            });
          }
        } else {
          resolve({
            success: false,
            error: stderr || `Process exited with code ${code}`
          });
        }
      });

      childProcess.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  }
} 