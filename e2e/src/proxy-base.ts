import { spawn, ChildProcess } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface RunConfig {
  port?: number;
  env?: Record<string, string>;
  [key: string]: any;
}

export interface ProcessResult {
  success: boolean;
  data?: any;
  error?: string;
  exitCode?: number;
}

export abstract class BaseProxy {
  protected process: ChildProcess | null = null;
  protected directory: string;
  protected readyLog: string;
  protected resultLog?: string;

  constructor(directory: string, readyLog: string, resultLog?: string) {
    this.directory = directory;
    this.readyLog = readyLog;
    this.resultLog = resultLog;
  }

  protected getRunCommand(): string[] {
    const runShPath = join(this.directory, 'run.sh');

    if (!existsSync(runShPath)) {
      throw new Error(`run.sh not found in ${this.directory}`);
    }

    const runShContent = readFileSync(runShPath, 'utf-8');

    // Parse the run.sh file to extract the command
    // Look for lines that start with commands like pnpm, npm, node, python, etc.
    const lines = runShContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '') continue;

      // Look for command patterns
      if (trimmed.startsWith('pnpm ') ||
        trimmed.startsWith('npm ') ||
        trimmed.startsWith('node ') ||
        trimmed.startsWith('python ') ||
        trimmed.startsWith('uv run ') ||
        trimmed.startsWith('go run ')) {

        // Split the command into parts
        const parts = trimmed.split(' ');
        return parts;
      }
    }

    throw new Error(`No valid command found in ${runShPath}`);
  }

  protected async startProcess(config: RunConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = this.getRunCommand();
      const env = {
        ...process.env,
        ...config.env
      };

      this.process = spawn(command[0], command.slice(1), {
        env,
        stdio: 'pipe',
        cwd: this.directory
      });

      let output = '';
      let stderr = '';

      this.process.stdout?.on('data', (data) => {
        output += data.toString();
        if (output.includes(this.readyLog)) {
          resolve();
        }
      });

      this.process.stderr?.on('data', (data) => {
        stderr += data.toString();
        console.error(`[${this.directory}] stderr: ${data.toString()}`);
      });

      this.process.on('error', (error) => {
        console.error(`[${this.directory}] Error:`, error);
        reject(error);
      });

      this.process.on('exit', (code) => {
        // Only log non-zero exit codes for debugging
        if (code !== 0) {
          console.log(`[${this.directory}] Process exited with code ${code}`);
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          resolve();
        }
      }, 30000);
    });
  }

  protected async stopProcess(): Promise<void> {
    if (this.process) {
      return new Promise((resolve) => {
        const process = this.process!;
        process.kill('SIGTERM');

        // Force kill after 5 seconds
        const forceKillTimeout = setTimeout(() => {
          if (process && !process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);

        process.on('exit', () => {
          clearTimeout(forceKillTimeout);
          this.process = null;
          resolve();
        });

        // Fallback: if process doesn't exit within 10 seconds, resolve anyway
        setTimeout(() => {
          if (this.process) {
            this.process = null;
            resolve();
          }
        }, 10000);
      });
    }
  }

  protected async waitForResult(): Promise<ProcessResult> {
    return new Promise((resolve) => {
      if (!this.process) {
        resolve({ success: false, error: 'No process running' });
        return;
      }

      let stdout = '';
      let stderr = '';

      this.process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      this.process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      this.process.on('close', (code) => {
        if (code === 0) {
          try {
            // Find JSON result in stdout
            const lines = stdout.split('\n');
            const jsonLine = lines.find(line => line.trim().startsWith('{'));
            if (jsonLine) {
              const result = JSON.parse(jsonLine);
              resolve({ success: true, data: result, exitCode: code });
            } else {
              resolve({ success: false, error: 'No JSON result found', exitCode: code });
            }
          } catch (error) {
            resolve({ success: false, error: `Failed to parse result: ${error}`, exitCode: code });
          }
        } else {
          resolve({ success: false, error: stderr || `Process exited with code ${code}`, exitCode: code || undefined });
        }
      });

      this.process.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  }

  protected async runOneShotProcess(config: RunConfig): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const command = this.getRunCommand();
      const processEnv = {
        ...process.env,
        ...config.env
      };

      const childProcess = spawn(command[0], command.slice(1), {
        env: processEnv,
        stdio: 'pipe',
        cwd: this.directory
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        console.error(`[${this.directory}] stderr: ${data.toString()}`);
      });

      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          try {
            // Find JSON result in stdout
            const lines = stdout.split('\n');
            const jsonLine = lines.find(line => line.trim().startsWith('{'));
            if (jsonLine) {
              const result = JSON.parse(jsonLine);
              resolve({ success: true, data: result, exitCode: code });
            } else {
              resolve({ success: false, error: 'No JSON result found', exitCode: code });
            }
          } catch (error) {
            resolve({ success: false, error: `Failed to parse result: ${error}`, exitCode: code });
          }
        } else {
          resolve({ success: false, error: stderr || `Process exited with code ${code}`, exitCode: code || undefined });
        }
      });

      childProcess.on('error', (error: Error) => {
        resolve({ success: false, error: error.message });
      });
    });
  }
} 