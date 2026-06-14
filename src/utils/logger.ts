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
 * Substrings that mark a key as sensitive (case-insensitive).
 * If a (lowercased) key contains any of these, its value is masked.
 */
const SENSITIVE_KEY_PARTS = [
  "token",
  "password",
  "passwd",
  "secret",
  "authorization",
  "credential",
  "apikey",
  "api_key",
] as const;

const REDACTED = "***";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => lower.includes(part));
}

/**
 * Returns a redacted deep copy of a logging value (defense-in-depth).
 *
 * - For plain objects: keys whose name contains a sensitive substring
 *   (case-insensitive) get their value replaced by "***"; other values
 *   are recursed into.
 * - For arrays: each element is recursed into (an array itself is never
 *   treated as a "sensitive key").
 * - Primitives (string/number/boolean/null/undefined) and other values
 *   are returned unchanged.
 * - The original input is never mutated (a new structure is returned).
 * - Defensive: never throws. Logging inputs are expected to be flat /
 *   JSON-like, so circular references are not anticipated; should anything
 *   unexpected happen, the value is returned as-is rather than throwing.
 */
function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value !== null && typeof value === "object") {
    // Only recurse into plain-ish objects; leave exotic objects untouched.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redactValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Redact sensitive keys in an `extra` log payload without mutating the
 * caller's object. Returns a new object (or undefined if input is undefined).
 */
function redactExtra(
  extra?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!extra) return extra;
  try {
    return redactValue(extra) as Record<string, unknown>;
  } catch {
    // Never let logging redaction break the caller.
    return extra;
  }
}

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

    // Redact sensitive keys once (defense-in-depth); never mutates caller's object.
    const safeExtra = redactExtra(extra);

    // If we have an OpenCode client, use it for structured logging
    if (this.client) {
      try {
        await this.client.app.log({
          service: this.service,
          level,
          message,
          extra: safeExtra,
        });
        return;
      } catch {
        // Fall back to console logging
      }
    }

    // Console logging
    const formatted = this.formatMessage(level, message, safeExtra);
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
