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
