/**
 * Tests for logger utilities
 */

import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { Logger, createLogger } from "./logger.ts";

describe("Logger", () => {
  let consoleSpy: { debug: any; info: any; warn: any; error: any };

  beforeEach(() => {
    consoleSpy = {
      debug: spyOn(console, "debug").mockImplementation(() => {}),
      info: spyOn(console, "info").mockImplementation(() => {}),
      warn: spyOn(console, "warn").mockImplementation(() => {}),
      error: spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.debug.mockRestore();
    consoleSpy.info.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  test("creates logger with service name", () => {
    const logger = new Logger("test-service");
    logger.info("test message");

    expect(consoleSpy.info).toHaveBeenCalled();
    const call = consoleSpy.info.mock.calls[0][0];
    expect(call).toContain("test-service");
  });

  test("logs info messages", () => {
    const logger = new Logger("test");
    logger.info("info message");

    expect(consoleSpy.info).toHaveBeenCalled();
    const call = consoleSpy.info.mock.calls[0][0];
    expect(call).toContain("info message");
  });

  test("logs warn messages", () => {
    const logger = new Logger("test");
    logger.warn("warning message");

    expect(consoleSpy.warn).toHaveBeenCalled();
    const call = consoleSpy.warn.mock.calls[0][0];
    expect(call).toContain("warning message");
  });

  test("logs error messages", () => {
    const logger = new Logger("test");
    logger.error("error message");

    expect(consoleSpy.error).toHaveBeenCalled();
    const call = consoleSpy.error.mock.calls[0][0];
    expect(call).toContain("error message");
  });

  test("respects minimum log level", () => {
    const logger = new Logger("test", { minLevel: "warn" });
    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");

    expect(consoleSpy.debug).not.toHaveBeenCalled();
    expect(consoleSpy.info).not.toHaveBeenCalled();
    expect(consoleSpy.warn).toHaveBeenCalled();
  });

  test("includes extra data in log", () => {
    const logger = new Logger("test");
    logger.info("message with data", { key: "value" });

    expect(consoleSpy.info).toHaveBeenCalled();
    const call = consoleSpy.info.mock.calls[0][0];
    expect(call).toContain('"key":"value"');
  });

  test("creates child logger with sub-service name", () => {
    const parent = new Logger("parent");
    const child = parent.child("child");
    child.info("child message");

    expect(consoleSpy.info).toHaveBeenCalled();
    const call = consoleSpy.info.mock.calls[0][0];
    expect(call).toContain("parent:child");
  });

  test("child logger inherits min level", () => {
    const parent = new Logger("parent", { minLevel: "error" });
    const child = parent.child("child");
    child.warn("should not log");
    child.error("should log");

    expect(consoleSpy.warn).not.toHaveBeenCalled();
    expect(consoleSpy.error).toHaveBeenCalled();
  });

  test("debug level logs when enabled", () => {
    const logger = new Logger("test", { minLevel: "debug" });
    logger.debug("debug message");

    expect(consoleSpy.debug).toHaveBeenCalled();
  });
});

describe("Logger redaction", () => {
  // Capture the `extra` payload handed to the OpenCode client.
  function makeCapturingLogger() {
    const captured: { extra?: Record<string, unknown> } = {};
    const client = {
      app: {
        log: async (entry: { extra?: Record<string, unknown> }) => {
          captured.extra = entry.extra;
        },
      },
    };
    const logger = new Logger("redact-test", { minLevel: "debug", client });
    return { logger, captured };
  }

  test("masks top-level sensitive keys (client path)", async () => {
    const { logger, captured } = makeCapturingLogger();
    logger.info("sensitive", {
      token: "sqp_realtoken",
      password: "hunter2",
      Authorization: "Bearer abc",
      apiKey: "k-123",
      api_key: "k-456",
      secret: "s",
      credential: "c",
      passwd: "p",
    });
    await Promise.resolve();

    expect(captured.extra).toEqual({
      token: "***",
      password: "***",
      Authorization: "***",
      apiKey: "***",
      api_key: "***",
      secret: "***",
      credential: "***",
      passwd: "***",
    });
  });

  test("masks keys that merely contain a sensitive substring, case-insensitively", async () => {
    const { logger, captured } = makeCapturingLogger();
    logger.info("substring", {
      accessToken: "x",
      USER_PASSWORD: "y",
      myApiKeyHeader: "z",
    });
    await Promise.resolve();

    expect(captured.extra).toEqual({
      accessToken: "***",
      USER_PASSWORD: "***",
      myApiKeyHeader: "***",
    });
  });

  test("leaves non-sensitive keys unchanged (client path)", async () => {
    const { logger, captured } = makeCapturingLogger();
    logger.info("harmless", {
      projectKey: "my-project",
      count: 42,
      enabled: true,
      nothing: null,
    });
    await Promise.resolve();

    expect(captured.extra).toEqual({
      projectKey: "my-project",
      count: 42,
      enabled: true,
      nothing: null,
    });
  });

  test("redacts sensitive keys inside nested objects and arrays", async () => {
    const { logger, captured } = makeCapturingLogger();
    logger.info("nested", {
      outer: {
        token: "secret-token",
        safe: "keep",
        deeper: { password: "p", value: 1 },
      },
      items: [{ apiKey: "a" }, { name: "ok" }],
    });
    await Promise.resolve();

    expect(captured.extra).toEqual({
      outer: {
        token: "***",
        safe: "keep",
        deeper: { password: "***", value: 1 },
      },
      items: [{ apiKey: "***" }, { name: "ok" }],
    });
  });

  test("does not mutate the caller's original extra object", async () => {
    const { logger, captured } = makeCapturingLogger();
    const original = {
      token: "secret",
      nested: { password: "p" },
    };
    logger.info("no mutation", original);
    await Promise.resolve();

    // Original is untouched...
    expect(original.token).toBe("secret");
    expect(original.nested.password).toBe("p");
    // ...while the captured payload is redacted.
    expect(captured.extra).toEqual({ token: "***", nested: { password: "***" } });
  });

  test("masks sensitive values in console output too (console path)", () => {
    const consoleSpy = spyOn(console, "info").mockImplementation(() => {});
    try {
      const logger = new Logger("redact-console");
      logger.info("login", { password: "supersecret", user: "admin" });

      expect(consoleSpy).toHaveBeenCalled();
      const call = consoleSpy.mock.calls[0][0];
      expect(call).not.toContain("supersecret");
      expect(call).toContain('"password":"***"');
      expect(call).toContain('"user":"admin"');
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe("createLogger", () => {
  test("creates logger with service name", () => {
    const logger = createLogger("my-service");
    expect(logger).toBeInstanceOf(Logger);
  });

  test("creates logger with client integration", () => {
    const mockClient = {
      app: {
        log: async () => {},
      },
    };

    const logger = createLogger("test", mockClient);
    expect(logger).toBeInstanceOf(Logger);
  });
});
