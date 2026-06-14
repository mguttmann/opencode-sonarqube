/**
 * Tests for Scanner Runner
 */

import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { formatAnalysisResult, runScanner, runAnalysis } from "./runner.ts";
import type { AnalysisResult, SonarQubeConfig, ProjectState, ScannerOptions } from "../types/index.ts";
import * as apiModule from "../api/index.ts";
import * as configModule from "./config.ts";

// Helper to create a mock config
function createMockConfig(overrides: Record<string, unknown> = {}): SonarQubeConfig {
  return {
    url: "http://sonar.example.com",
    user: "admin",
    password: "admin",
    level: "enterprise",
    autoAnalyze: true,
    sources: "src",
    newCodeDefinition: "previous_version",
    ...overrides,
  };
}

// Helper to create a mock project state
function createMockProjectState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    projectKey: "test-project",
    projectToken: "sqp_test123",
    tokenName: "opencode-test-project",
    initializedAt: new Date().toISOString(),
    languages: ["typescript"],
    setupComplete: true,
    ...overrides,
  };
}

// Helper to create a mock scanner options
function createMockScannerOptions(overrides: Partial<ScannerOptions> = {}): ScannerOptions {
  return {
    projectKey: "test-project",
    projectName: "Test Project",
    sources: "src",
    ...overrides,
  };
}

describe("Scanner Runner", () => {
  describe("formatAnalysisResult", () => {
    test("formats result with no issues", () => {
      const result: AnalysisResult = {
        success: true,
        qualityGateStatus: "OK",
        issues: { total: 0, blocker: 0, critical: 0, major: 0, minor: 0, info: 0 },
        metrics: {},
        formattedIssues: [],
        timestamp: new Date().toISOString(),
      };

      const formatted = formatAnalysisResult(result);

      expect(formatted).toContain("SonarQube Analysis Results");
      expect(formatted).toContain("OK");
      expect(formatted).toContain("No issues found");
    });

    test("formats result with issues", () => {
      const result: AnalysisResult = {
        success: true,
        qualityGateStatus: "ERROR",
        issues: { total: 2, blocker: 1, critical: 1, major: 0, minor: 0, info: 0 },
        metrics: {},
        formattedIssues: [
          {
            key: "issue-1",
            severity: "BLOCKER",
            type: "BUG",
            rule: "ts:S123",
            message: "Critical bug",
            file: "src/app.ts",
            line: 10,
            quickFixAvailable: false,
          },
          {
            key: "issue-2",
            severity: "CRITICAL",
            type: "VULNERABILITY",
            rule: "ts:S456",
            message: "Security issue",
            file: "src/auth.ts",
            line: 20,
            quickFixAvailable: false,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      const formatted = formatAnalysisResult(result);

      expect(formatted).toContain("SonarQube Analysis Results");
      expect(formatted).toContain("ERROR");
      expect(formatted).toContain("BLOCKER");
      expect(formatted).toContain("Critical bug");
    });
  });

  describe("runScanner", () => {
    let originalSpawn: typeof Bun.spawn;

    beforeEach(() => {
      originalSpawn = Bun.spawn;
    });

    afterEach(() => {
      Bun.spawn = originalSpawn;
    });

    test("runs scanner successfully", async () => {
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Scanner output"));
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const mockProc = {
        stdout: mockStdout as any,
        stderr: mockStderr as any,
        exited: Promise.resolve(0),
      };

      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = () => mockProc;

      const config = createMockConfig();
      const state = createMockProjectState();
      const options = createMockScannerOptions();

      const result = await runScanner(config, state, options, "/tmp/test");

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Scanner output");
    });

    test("runs scanner with stderr output", async () => {
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Scanner stdout"));
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Scanner stderr warning"));
          controller.close();
        },
      });

      const mockProc = {
        stdout: mockStdout as any,
        stderr: mockStderr as any,
        exited: Promise.resolve(0),
      };

      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = () => mockProc;

      const config = createMockConfig();
      const state = createMockProjectState();
      const options = createMockScannerOptions();

      const result = await runScanner(config, state, options);

      expect(result.success).toBe(true);
      expect(result.output).toContain("Scanner stdout");
      expect(result.output).toContain("Scanner stderr warning");
    });

    test("returns failure when scanner exits with non-zero code", async () => {
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Some output"));
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Error occurred"));
          controller.close();
        },
      });

      const mockProc = {
        stdout: mockStdout as any,
        stderr: mockStderr as any,
        exited: Promise.resolve(1),
      };

      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = () => mockProc;

      const config = createMockConfig();
      const state = createMockProjectState();
      const options = createMockScannerOptions();

      const result = await runScanner(config, state, options);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain("exited with code 1");
    });

    test("handles exception during scanner execution", async () => {
      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = () => {
        throw new Error("Failed to spawn process");
      };

      const config = createMockConfig();
      const state = createMockProjectState();
      const options = createMockScannerOptions();

      const result = await runScanner(config, state, options);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain("Failed to spawn process");
    });

    test("includes optional scanner parameters", async () => {
      let capturedArgs: string[] = [];

      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const mockProc = {
        stdout: mockStdout as any,
        stderr: mockStderr as any,
        exited: Promise.resolve(0),
      };

      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = (args: string[]) => {
        capturedArgs = args;
        return mockProc;
      };

      const config = createMockConfig();
      const state = createMockProjectState();
      const options = createMockScannerOptions({
        tests: "tests",
        exclusions: "**/node_modules/**",
        branch: "feature-branch",
        additionalProperties: {
          "sonar.javascript.lcov.reportPaths": "coverage/lcov.info",
        },
      });

      await runScanner(config, state, options);

      expect(capturedArgs).toContain("-Dsonar.tests=tests");
      expect(capturedArgs).toContain("-Dsonar.exclusions=**/node_modules/**");
      expect(capturedArgs).toContain("-Dsonar.branch.name=feature-branch");
      expect(capturedArgs).toContain("-Dsonar.javascript.lcov.reportPaths=coverage/lcov.info");
    });

    test("includes PR analysis parameters", async () => {
      let capturedArgs: string[] = [];

      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const mockProc = {
        stdout: mockStdout as any,
        stderr: mockStderr as any,
        exited: Promise.resolve(0),
      };

      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = (args: string[]) => {
        capturedArgs = args;
        return mockProc;
      };

      const config = createMockConfig();
      const state = createMockProjectState();
      const options = createMockScannerOptions({
        pullRequest: {
          key: "123",
          branch: "feature/my-branch",
          base: "main",
        },
      });

      await runScanner(config, state, options);

      expect(capturedArgs).toContain("-Dsonar.pullrequest.key=123");
      expect(capturedArgs).toContain("-Dsonar.pullrequest.branch=feature/my-branch");
      expect(capturedArgs).toContain("-Dsonar.pullrequest.base=main");
    });
  });

  describe("runAnalysis", () => {
    let originalSpawn: typeof Bun.spawn;
    let originalFile: typeof Bun.file;
    let originalSleep: typeof Bun.sleep;

    beforeEach(() => {
      originalSpawn = Bun.spawn;
      originalFile = Bun.file;
      originalSleep = Bun.sleep;
      // Mock sleep to avoid test delay
      // @ts-ignore - mocking Bun.sleep
      Bun.sleep = () => Promise.resolve();
    });

    afterEach(() => {
      Bun.spawn = originalSpawn;
      Bun.file = originalFile;
      Bun.sleep = originalSleep;
    });

    test("runs full analysis and returns results", async () => {
      // Mock Bun.file to return a file that exists
      // @ts-ignore - mocking Bun.file
      Bun.file = () => ({
        exists: () => Promise.resolve(true),
      });

      // Mock spawn for scanner
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = () => ({
        stdout: mockStdout as any,
        stderr: mockStderr as any,
        exited: Promise.resolve(0),
      });

      // Mock API
      const mockAPI = {
        qualityGate: {
          getStatus: () => Promise.resolve({
            projectStatus: {
              status: "OK",
              conditions: [],
            },
          }),
          getQualityMetrics: () => Promise.resolve({
            coverage: 85,
            duplications: 0,
            bugs: 0,
            vulnerabilities: 0,
            codeSmells: 0,
            securityHotspots: 0,
          }),
        },
        issues: {
          getCounts: () => Promise.resolve({
            total: 0,
            blocker: 0,
            critical: 0,
            major: 0,
            minor: 0,
            info: 0,
          }),
          getFormattedIssues: () => Promise.resolve([]),
        },
      };

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI");
      createAPISpy.mockReturnValue(mockAPI as unknown as ReturnType<typeof apiModule.createSonarQubeAPI>);

      const config = createMockConfig();
      const state = createMockProjectState();

      const result = await runAnalysis(config, state, { projectKey: "test-project" });

      expect(result.success).toBe(true);
      expect(result.qualityGateStatus).toBe("OK");
      expect(result.issues.total).toBe(0);
      expect(result.metrics.coverage).toBe(85);

      createAPISpy.mockRestore();
    });

    test("creates sonar-project.properties if it doesn't exist", async () => {
      // Mock Bun.file to return a file that doesn't exist
      // @ts-ignore - mocking Bun.file
      Bun.file = () => ({
        exists: () => Promise.resolve(false),
      });

      // Mock spawn for scanner
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = () => ({
        stdout: mockStdout as any,
        stderr: mockStderr as any,
        exited: Promise.resolve(0),
      });

      // Mock writePropertiesFile
      const writePropertiesSpy = spyOn(configModule, "writePropertiesFile");
      writePropertiesSpy.mockResolvedValue("/tmp/sonar-project.properties");

      // Mock API
      const mockAPI = {
        qualityGate: {
          getStatus: () => Promise.resolve({
            projectStatus: {
              status: "OK",
              conditions: [],
            },
          }),
          getQualityMetrics: () => Promise.resolve({
            coverage: 80,
            duplications: 0,
            bugs: 0,
            vulnerabilities: 0,
            codeSmells: 0,
            securityHotspots: 0,
          }),
        },
        issues: {
          getCounts: () => Promise.resolve({
            total: 0,
            blocker: 0,
            critical: 0,
            major: 0,
            minor: 0,
            info: 0,
          }),
          getFormattedIssues: () => Promise.resolve([]),
        },
      };

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI");
      createAPISpy.mockReturnValue(mockAPI as unknown as ReturnType<typeof apiModule.createSonarQubeAPI>);

      const config = createMockConfig();
      const state = createMockProjectState();

      await runAnalysis(config, state, { projectKey: "test-project" }, "/tmp/test");

      expect(writePropertiesSpy).toHaveBeenCalled();

      writePropertiesSpy.mockRestore();
      createAPISpy.mockRestore();
    });

    test("handles API error gracefully", async () => {
      // Mock Bun.file
      // @ts-ignore - mocking Bun.file
      Bun.file = () => ({
        exists: () => Promise.resolve(true),
      });

      // Mock spawn for scanner
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = () => ({
        stdout: mockStdout as any,
        stderr: mockStderr as any,
        exited: Promise.resolve(0),
      });

      // Mock API that throws
      const mockAPI = {
        qualityGate: {
          getStatus: () => Promise.reject(new Error("API unavailable")),
          getQualityMetrics: () => Promise.reject(new Error("API unavailable")),
        },
        issues: {
          getCounts: () => Promise.reject(new Error("API unavailable")),
          getFormattedIssues: () => Promise.reject(new Error("API unavailable")),
        },
      };

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI");
      createAPISpy.mockReturnValue(mockAPI as unknown as ReturnType<typeof apiModule.createSonarQubeAPI>);

      const config = createMockConfig();
      const state = createMockProjectState();

      const result = await runAnalysis(config, state, { projectKey: "test-project" });

      // Should return partial result with defaults
      expect(result.success).toBe(true); // Scanner succeeded
      expect(result.qualityGateStatus).toBe("NONE");
      expect(result.issues.total).toBe(0);

      createAPISpy.mockRestore();
    });

    test("handles metrics fetch error gracefully (uses issue counts)", async () => {
      // Mock Bun.file
      // @ts-ignore - mocking Bun.file
      Bun.file = () => ({
        exists: () => Promise.resolve(true),
      });

      // Mock spawn for scanner
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = () => ({
        stdout: mockStdout as any,
        stderr: mockStderr as any,
        exited: Promise.resolve(0),
      });

      // Mock API where only getQualityMetrics fails
      const mockAPI = {
        qualityGate: {
          getStatus: () => Promise.resolve({
            projectStatus: {
              status: "ERROR",
              conditions: [],
            },
          }),
          getQualityMetrics: () => Promise.reject(new Error("Metrics not available yet")),
        },
        issues: {
          getCounts: () => Promise.resolve({
            total: 5,
            blocker: 1,
            critical: 2,
            major: 2,
            minor: 0,
            info: 0,
          }),
          getFormattedIssues: () => Promise.resolve([
            {
              key: "issue-1",
              severity: "BLOCKER",
              type: "BUG",
              rule: "ts:S123",
              message: "Bug found",
              file: "src/app.ts",
              line: 10,
              quickFixAvailable: false,
            },
          ]),
        },
      };

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI");
      createAPISpy.mockReturnValue(mockAPI as unknown as ReturnType<typeof apiModule.createSonarQubeAPI>);

      const config = createMockConfig();
      const state = createMockProjectState();

      const result = await runAnalysis(config, state, { projectKey: "test-project" });

      expect(result.success).toBe(true);
      expect(result.qualityGateStatus).toBe("ERROR");
      expect(result.issues.blocker).toBe(1);
      expect(result.issues.critical).toBe(2);
      // Metrics should be derived from issues since getQualityMetrics failed
      expect(result.metrics.bugs).toBe(3); // blocker + critical
      expect(result.metrics.codeSmells).toBe(2); // major + minor + info

      createAPISpy.mockRestore();
    });

    test("handles failed scanner but still fetches results", async () => {
      // Mock Bun.file
      // @ts-ignore - mocking Bun.file
      Bun.file = () => ({
        exists: () => Promise.resolve(true),
      });

      // Mock spawn for scanner (fails)
      const mockStdout = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Scanner error"));
          controller.close();
        },
      });
      const mockStderr = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      // @ts-ignore - mocking Bun.spawn
      Bun.spawn = () => ({
        stdout: mockStdout as any,
        stderr: mockStderr as any,
        exited: Promise.resolve(1), // Non-zero exit
      });

      // Mock API
      const mockAPI = {
        qualityGate: {
          getStatus: () => Promise.resolve({
            projectStatus: {
              status: "OK",
              conditions: [],
            },
          }),
          getQualityMetrics: () => Promise.resolve({
            coverage: 80,
            duplications: 0,
            bugs: 0,
            vulnerabilities: 0,
            codeSmells: 0,
            securityHotspots: 0,
          }),
        },
        issues: {
          getCounts: () => Promise.resolve({
            total: 0,
            blocker: 0,
            critical: 0,
            major: 0,
            minor: 0,
            info: 0,
          }),
          getFormattedIssues: () => Promise.resolve([]),
        },
      };

      const createAPISpy = spyOn(apiModule, "createSonarQubeAPI");
      createAPISpy.mockReturnValue(mockAPI as unknown as ReturnType<typeof apiModule.createSonarQubeAPI>);

      const config = createMockConfig();
      const state = createMockProjectState();

      const result = await runAnalysis(config, state, { projectKey: "test-project" });

      // Scanner failed but API results are fetched
      expect(result.success).toBe(false);
      expect(result.qualityGateStatus).toBe("OK");

      createAPISpy.mockRestore();
    });
  });
});
