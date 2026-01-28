/**
 * Structured logging utilities for the SonarQube plugin
 * @module logger
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  service: string;
  timestamp: string;
  extra?: Record<string, unknown>;
}

const LOG_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m", // Gray
  info: "\x1b[36m",  // Cyan
  warn: "\x1b[33m",  // Yellow
  error: "\x1b[31m", // Red
};

const RESET = "\x1b[0m";

/**
 * Logger class for structured logging
 */
export class Logger {
  private readonly service: string;
  private readonly minLevel: LogLevel;
  private readonly client?: {
    app: {
      log: (entry: Omit<LogEntry, "timestamp">) => Promise<void>;
    };
  };

  constructor(
    service: string,
    options?: {
      minLevel?: LogLevel;
      client?: {
        app: {
          log: (entry: Omit<LogEntry, "timestamp">) => Promise<void>;
        };
      };
    }
  ) {
    this.service = service;
    this.minLevel = options?.minLevel ?? "info";
    this.client = options?.client;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatMessage(level: LogLevel, message: string, extra?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const color = LOG_COLORS[level];
    const prefix = `${color}[${this.service}]${RESET}`;
    const levelStr = `${color}${level.toUpperCase()}${RESET}`;
    
    let formatted = `${prefix} ${timestamp} ${levelStr}: ${message}`;
    
    if (extra && Object.keys(extra).length > 0) {
      formatted += ` ${JSON.stringify(extra)}`;
    }
    
    return formatted;
  }

  private async log(level: LogLevel, message: string, extra?: Record<string, unknown>): Promise<void> {
    if (!this.shouldLog(level)) return;

    // If we have an OpenCode client, use it for structured logging
    if (this.client) {
      try {
        await this.client.app.log({
          service: this.service,
          level,
          message,
          extra,
        });
        return;
      } catch {
        // Fall back to console logging
      }
    }

    // Console logging
    const formatted = this.formatMessage(level, message, extra);
    switch (level) {
      case "debug":
        console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
        console.error(formatted);
        break;
    }
  }

  debug(message: string, extra?: Record<string, unknown>): void {
    void this.log("debug", message, extra);
  }

  info(message: string, extra?: Record<string, unknown>): void {
    void this.log("info", message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    void this.log("warn", message, extra);
  }

  error(message: string, extra?: Record<string, unknown>): void {
    void this.log("error", message, extra);
  }

  /**
   * Create a child logger with a sub-service name
   */
  child(subService: string): Logger {
    return new Logger(`${this.service}:${subService}`, {
      minLevel: this.minLevel,
      client: this.client,
    });
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger("opencode-sonarqube");

/**
 * Interface for logger methods (useful for no-op loggers and dependency injection)
 */
export interface LoggerInterface {
  info: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  error: (msg: string, extra?: Record<string, unknown>) => void;
  debug: (msg: string, extra?: Record<string, unknown>) => void;
}

/**
 * Create a no-op logger that silently discards all log messages
 * Useful for tests or when logging should be disabled
 */
export function createNoopLogger(): LoggerInterface {
  const noop = () => {};
  return { info: noop, warn: noop, error: noop, debug: noop };
}

/**
 * Create a logger with OpenCode client integration
 */
export function createLogger(
  service: string,
  client?: {
    app: {
      log: (entry: Omit<LogEntry, "timestamp">) => Promise<void>;
    };
  }
): Logger {
  return new Logger(service, { client });
}
