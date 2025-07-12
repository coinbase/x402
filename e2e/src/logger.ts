import { WriteStream, createWriteStream } from 'fs';

interface LoggerConfig {
  logFile?: string;
  verbose?: boolean;
}

class Logger {
  private logStream: WriteStream | null = null;
  private isVerbose: boolean = false;

  constructor(config: LoggerConfig) {
    this.isVerbose = config.verbose || false;

    if (config.logFile) {
      try {
        this.logStream = createWriteStream(config.logFile);
        this.log(`🚀 X402 E2E Test Suite - Log started at ${new Date().toISOString()}`);
        this.log(`📝 Logging output to: ${config.logFile}`);
      } catch (error) {
        console.error(`Failed to create log file ${config.logFile}:`, error);
        process.exit(1);
      }
    }
  }

  log(message: string, toFile: boolean = true): void {
    console.log(message);
    if (this.logStream && toFile) {
      this.logStream.write(message + '\n');
    }
  }

  verboseLog(message: string, toFile: boolean = true): void {
    if (this.isVerbose) {
      this.log(message, toFile);
    }
  }

  errorLog(message: string, toFile: boolean = true): void {
    console.error(message);
    if (this.logStream && toFile) {
      this.logStream.write(`ERROR: ${message}\n`);
    }
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// Single global logger instance
let globalLogger: Logger | null = null;

/**
 * Configure and initialize the global logger
 */
export function config(options: LoggerConfig): void {
  if (globalLogger) {
    globalLogger.close();
  }
  globalLogger = new Logger(options);
}

/**
 * Log a normal message that will always be shown
 */
export function log(message: string, toFile: boolean = true): void {
  if (!globalLogger) {
    globalLogger = new Logger({});
  }
  globalLogger.log(message, toFile);
}

/**
 * Log a verbose message that will only be shown if verbose mode is enabled
 */
export function verboseLog(message: string, toFile: boolean = true): void {
  if (!globalLogger) {
    globalLogger = new Logger({});
  }
  globalLogger.verboseLog(message, toFile);
}

/**
 * Log an error message
 */
export function errorLog(message: string, toFile: boolean = true): void {
  if (!globalLogger) {
    globalLogger = new Logger({});
  }
  globalLogger.errorLog(message, toFile);
}

/**
 * Close the logger and its file streams
 */
export function close(): void {
  if (globalLogger) {
    globalLogger.close();
    globalLogger = null;
  }
} 