/**
 * Tests for config utilities
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  loadConfig,
  deriveProjectKey,
  getProjectKey,
  getProjectName,
  sanitizeProjectKey,
  getSeverityThreshold,
  shouldFailBuild,
} from "./config.ts";

describe("sanitizeProjectKey", () => {
  test("converts to lowercase", () => {
    expect(sanitizeProjectKey("MyProject")).toBe("myproject");
  });

  test("replaces invalid characters with dashes", () => {
    expect(sanitizeProjectKey("my@project#name")).toBe("my-project-name");
  });

  test("collapses multiple dashes", () => {
    expect(sanitizeProjectKey("my---project")).toBe("my-project");
  });

  test("removes leading and trailing dashes", () => {
    expect(sanitizeProjectKey("-my-project-")).toBe("my-project");
  });

  test("handles special characters", () => {
    expect(sanitizeProjectKey("@scope/package-name")).toBe("scope-package-name");
  });

  test("preserves underscores", () => {
    expect(sanitizeProjectKey("my_project_name")).toBe("my_project_name");
  });

  test("truncates to 400 characters", () => {
    const longName = "a".repeat(500);
    expect(sanitizeProjectKey(longName).length).toBe(400);
  });

  test("handles empty string with fallback", () => {
    expect(sanitizeProjectKey("")).toBe("project");
  });

  test("handles all-special-chars with fallback", () => {
    expect(sanitizeProjectKey("@@@")).toBe("project");
  });
});

describe("getSeverityThreshold", () => {
  test("enterprise level returns all severities", () => {
    const result = getSeverityThreshold("enterprise");
    expect(result).toContain("BLOCKER");
    expect(result).toContain("CRITICAL");
    expect(result).toContain("MAJOR");
    expect(result).toContain("MINOR");
    expect(result).toContain("INFO");
  });

  test("standard level returns major and above", () => {
    const result = getSeverityThreshold("standard");
    expect(result).toContain("BLOCKER");
    expect(result).toContain("CRITICAL");
    expect(result).toContain("MAJOR");
    expect(result).not.toContain("MINOR");
    expect(result).not.toContain("INFO");
  });

  test("relaxed level returns only critical issues", () => {
    const result = getSeverityThreshold("relaxed");
    expect(result).toContain("BLOCKER");
    expect(result).toContain("CRITICAL");
    expect(result).not.toContain("MAJOR");
  });

  test("off level returns empty array", () => {
    const result = getSeverityThreshold("off");
    expect(result).toEqual([]);
  });
});

describe("shouldFailBuild", () => {
  test("enterprise level fails on blocker", () => {
    expect(shouldFailBuild("enterprise", "BLOCKER")).toBe(true);
  });

  test("enterprise level fails on critical", () => {
    expect(shouldFailBuild("enterprise", "CRITICAL")).toBe(true);
  });

  test("enterprise level fails on major", () => {
    expect(shouldFailBuild("enterprise", "MAJOR")).toBe(true);
  });

  test("enterprise level does not fail on minor", () => {
    expect(shouldFailBuild("enterprise", "MINOR")).toBe(false);
  });

  test("standard level fails on blocker and critical", () => {
    expect(shouldFailBuild("standard", "BLOCKER")).toBe(true);
    expect(shouldFailBuild("standard", "CRITICAL")).toBe(true);
    expect(shouldFailBuild("standard", "MAJOR")).toBe(false);
  });

  test("relaxed level only fails on blocker", () => {
    expect(shouldFailBuild("relaxed", "BLOCKER")).toBe(true);
    expect(shouldFailBuild("relaxed", "CRITICAL")).toBe(false);
  });

  test("off level never fails", () => {
    expect(shouldFailBuild("off", "BLOCKER")).toBe(false);
    expect(shouldFailBuild("off", "CRITICAL")).toBe(false);
  });

  test("unknown level does not fail", () => {
    // @ts-expect-error testing unknown level
    expect(shouldFailBuild("unknown", "BLOCKER")).toBe(false);
    // @ts-expect-error testing unknown level
    expect(shouldFailBuild("unknown", "CRITICAL")).toBe(false);
  });
});

describe("deriveProjectKey", () => {
  let testDir: string;

  beforeEach(async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    testDir = await mkdtemp(join(tmpdir(), "config-test-"));
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(testDir, { recursive: true, force: true });
  });

  test("derives key from package.json name", async () => {
    await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "my-package" }));
    const result = await deriveProjectKey(testDir);
    expect(result).toBe("my-package");
  });

  test("derives key from directory name when no package.json", async () => {
    const result = await deriveProjectKey(testDir);
    expect(result).toContain("config-test");
  });
});

describe("getProjectKey", () => {
  let testDir: string;

  beforeEach(async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    testDir = await mkdtemp(join(tmpdir(), "config-test-"));
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(testDir, { recursive: true, force: true });
  });

  test("returns config projectKey when provided", async () => {
    const config = {
      url: "https://sonar.example.com",
      user: "admin",
      password: "secret",
      projectKey: "custom-key",
      level: "enterprise" as const,
      autoAnalyze: true,
      newCodeDefinition: "previous_version" as const,
      sources: "src",
    };
    const result = await getProjectKey(config, testDir);
    expect(result).toBe("custom-key");
  });

  test("derives from package.json when no config key", async () => {
    await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "@scope/my-pkg" }));
    const result = await getProjectKey(undefined, testDir);
    expect(result).toBe("scope-my-pkg");
  });

  test("derives from directory when no package.json", async () => {
    // testDir has no package.json, so it should use directory name
    const result = await getProjectKey(undefined, testDir);
    expect(result).toContain("config-test");
  });

  test("uses current directory when no directory provided", async () => {
    const result = await getProjectKey();
    expect(result).toBeTruthy();
  });

  test("falls back to directory name when package.json has no name", async () => {
    // Create package.json without name field
    await Bun.write(`${testDir}/package.json`, JSON.stringify({ version: "1.0.0" }));
    const result = await getProjectKey(undefined, testDir);
    // Should fall back to directory name since package.json has no name
    expect(result).toContain("config-test");
  });

  test("uses cwd when directory is undefined and no config", async () => {
    // Explicitly pass undefined for both
    const result = await getProjectKey(undefined, undefined);
    // Should use current working directory name
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("falls back to cwd when no directory provided and package.json fails", async () => {
    // Save original Bun.file
    const originalFile = Bun.file;

    // Mock Bun.file to throw for ./package.json
    // @ts-expect-error - mocking Bun.file
    Bun.file = (path: string) => {
      if (path === "./package.json") {
        return {
          json: () => Promise.reject(new Error("File not found")),
        };
      }
      return originalFile(path);
    };

    try {
      const result = await getProjectKey(undefined, undefined);
      // Should fall back to cwd name
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    } finally {
      // Restore original
      Bun.file = originalFile;
    }
  });
});

describe("getProjectName", () => {
  let testDir: string;

  beforeEach(async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    testDir = await mkdtemp(join(tmpdir(), "config-test-"));
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(testDir, { recursive: true, force: true });
  });

  test("returns config projectName when provided", async () => {
    const config = {
      url: "https://sonar.example.com",
      user: "admin",
      password: "secret",
      projectName: "My Custom Name",
      level: "enterprise" as const,
      autoAnalyze: true,
      newCodeDefinition: "previous_version" as const,
      sources: "src",
    };
    const result = await getProjectName(config, testDir);
    expect(result).toBe("My Custom Name");
  });

  test("derives from package.json when no config name", async () => {
    await Bun.write(`${testDir}/package.json`, JSON.stringify({ name: "package-name" }));
    const result = await getProjectName(undefined, testDir);
    expect(result).toBe("package-name");
  });

  test("falls back to project key when no package.json", async () => {
    const result = await getProjectName(undefined, testDir);
    expect(result).toContain("config-test");
  });
});

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env["SONAR_HOST_URL"];
    delete process.env["SONAR_USER"];
    delete process.env["SONAR_PASSWORD"];
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  test("returns null when no config provided", () => {
    const result = loadConfig();
    expect(result).toBeNull();
  });

  test("loads config from raw config object", () => {
    const result = loadConfig({
      url: "https://sonar.example.com",
      user: "admin",
      password: "secret",
    });
    expect(result).not.toBeNull();
    expect(result?.url).toBe("https://sonar.example.com");
    expect(result?.user).toBe("admin");
  });

  test("applies default values", () => {
    const result = loadConfig({
      url: "https://sonar.example.com",
      user: "admin",
      password: "secret",
    });
    expect(result?.level).toBe("enterprise");
    expect(result?.autoAnalyze).toBe(true);
  });

  test("env vars override config", () => {
    process.env["SONAR_HOST_URL"] = "https://env-sonar.example.com";
    process.env["SONAR_USER"] = "envuser";
    process.env["SONAR_PASSWORD"] = "envpassword";

    const result = loadConfig({
      url: "https://config-sonar.example.com",
      user: "configuser",
      password: "configpassword",
    });

    expect(result?.url).toBe("https://env-sonar.example.com");
    expect(result?.user).toBe("envuser");
  });

  test("returns null for invalid config", () => {
    const result = loadConfig({
      url: "not-a-valid-url",
      user: "admin",
      password: "secret",
    });
    expect(result).toBeNull();
  });

  test("returns null when required fields missing", () => {
    const result = loadConfig({
      url: "https://sonar.example.com",
      // Missing user and password
    });
    expect(result).toBeNull();
  });
});
