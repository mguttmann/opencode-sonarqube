/**
 * Tests for Hook Functions
 */

import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import {
  createFileEditedHook,
  getEditedFiles,
  clearEditedFiles,
  resetAnalysisCooldown,
  createHooks,
  createIdleHook,
} from "./index.ts";
import * as bootstrapModule from "../bootstrap/index.ts";
import * as scannerModule from "../scanner/index.ts";
import type { ProjectState, AnalysisResult, BootstrapResult } from "../types/index.ts";

// Helper to create valid mock ProjectState
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

// Helper to create valid mock BootstrapResult
function createMockBootstrapResult(overrides: Partial<BootstrapResult> = {}): BootstrapResult {
  return {
    success: true,
    message: "Successfully initialized",
    projectKey: "test-project",
    languages: ["typescript", "javascript"],
    isNewProject: true,
    ...overrides,
  };
}

describe("Hook Functions", () => {
  beforeEach(() => {
    clearEditedFiles();
    resetAnalysisCooldown();
  });

  describe("createFileEditedHook", () => {
    test("tracks edited source files", () => {
      const hook = createFileEditedHook();

      hook({ filePath: "src/app.ts" });
      hook({ filePath: "src/utils/helper.ts" });

      const files = getEditedFiles();
      expect(files).toContain("src/app.ts");
      expect(files).toContain("src/utils/helper.ts");
    });

    test("ignores node_modules files", () => {
      const hook = createFileEditedHook();

      hook({ filePath: "node_modules/lodash/index.js" });

      expect(getEditedFiles()).toHaveLength(0);
    });

    test("ignores .git files", () => {
      const hook = createFileEditedHook();

      hook({ filePath: ".git/config" });

      expect(getEditedFiles()).toHaveLength(0);
    });

    test("ignores dist folder files", () => {
      const hook = createFileEditedHook();

      hook({ filePath: "dist/index.js" });

      expect(getEditedFiles()).toHaveLength(0);
    });

    test("ignores build folder files", () => {
      const hook = createFileEditedHook();

      hook({ filePath: "build/app.js" });

      expect(getEditedFiles()).toHaveLength(0);
    });

    test("ignores coverage folder files", () => {
      const hook = createFileEditedHook();

      hook({ filePath: "coverage/lcov.info" });

      expect(getEditedFiles()).toHaveLength(0);
    });

    test("ignores lock files", () => {
      const hook = createFileEditedHook();

      hook({ filePath: "yarn.lock" });
      hook({ filePath: "package-lock.json" });

      expect(getEditedFiles()).toHaveLength(0);
    });

    test("ignores .d.ts declaration files", () => {
      const hook = createFileEditedHook();

      hook({ filePath: "src/types.d.ts" });

      expect(getEditedFiles()).toHaveLength(0);
    });

    test("ignores .sonarqube folder files", () => {
      const hook = createFileEditedHook();

      hook({ filePath: ".sonarqube/project.json" });

      expect(getEditedFiles()).toHaveLength(0);
    });
  });

  describe("getEditedFiles", () => {
    test("returns empty array when no files edited", () => {
      expect(getEditedFiles()).toEqual([]);
    });

    test("returns array of edited files", () => {
      const hook = createFileEditedHook();
      hook({ filePath: "src/a.ts" });
      hook({ filePath: "src/b.ts" });

      const files = getEditedFiles();
      expect(files).toHaveLength(2);
    });

    test("does not include duplicates", () => {
      const hook = createFileEditedHook();
      hook({ filePath: "src/a.ts" });
      hook({ filePath: "src/a.ts" });

      expect(getEditedFiles()).toHaveLength(1);
    });
  });

  describe("clearEditedFiles", () => {
    test("clears all tracked files", () => {
      const hook = createFileEditedHook();
      hook({ filePath: "src/a.ts" });
      hook({ filePath: "src/b.ts" });

      clearEditedFiles();

      expect(getEditedFiles()).toEqual([]);
    });
  });

  describe("resetAnalysisCooldown", () => {
    test("resets the cooldown timer", () => {
      // This is primarily for testing - verify it doesn't throw
      resetAnalysisCooldown();
      expect(true).toBe(true);
    });
  });

  describe("createHooks", () => {
    test("returns object with sessionIdle and fileEdited hooks", () => {
      const hooks = createHooks(
        () => undefined,
        () => "/tmp"
      );

      expect(typeof hooks.sessionIdle).toBe("function");
      expect(typeof hooks.fileEdited).toBe("function");
    });
  });

  describe("createIdleHook", () => {
    test("returns undefined when config is not set", async () => {
      const hook = createIdleHook(
        () => undefined,
        () => "/tmp"
      );

      const result = await hook();
      expect(result).toBeUndefined();
    });

    test("returns undefined when analysis level is off", async () => {
      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "off",
            autoAnalyze: true,
          },
        }),
        () => "/tmp"
      );

      const result = await hook();
      expect(result).toBeUndefined();
    });

    test("returns undefined when autoAnalyze is false", async () => {
      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: false,
          },
        }),
        () => "/tmp"
      );

      const result = await hook();
      expect(result).toBeUndefined();
    });

    test("triggers bootstrap when needsBootstrap returns true", async () => {
      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(true);

      const bootstrapSpy = spyOn(bootstrapModule, "bootstrap");
      const mockBootstrapResult = createMockBootstrapResult({
        qualityGate: "Sonar way",
      });
      bootstrapSpy.mockResolvedValue(mockBootstrapResult);

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();

      expect(needsBootstrapSpy).toHaveBeenCalled();
      expect(bootstrapSpy).toHaveBeenCalled();
      expect(result).toContain("SonarQube Integration Initialized");
      expect(result).toContain("test-project");
      expect(result).toContain("typescript, javascript");
      expect(result).toContain("Sonar way");

      needsBootstrapSpy.mockRestore();
      bootstrapSpy.mockRestore();
    });

    test("returns error message when bootstrap fails", async () => {
      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(true);

      const bootstrapSpy = spyOn(bootstrapModule, "bootstrap");
      const mockFailedResult = createMockBootstrapResult({
        success: false,
        message: "Failed to connect to SonarQube server",
        projectKey: "",
        languages: [],
        isNewProject: false,
      });
      bootstrapSpy.mockResolvedValue(mockFailedResult);

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();

      expect(result).toContain("SonarQube Setup Failed");
      expect(result).toContain("Failed to connect to SonarQube server");

      needsBootstrapSpy.mockRestore();
      bootstrapSpy.mockRestore();
    });

    test("returns error message when bootstrap throws exception", async () => {
      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(true);

      const bootstrapSpy = spyOn(bootstrapModule, "bootstrap");
      bootstrapSpy.mockRejectedValue(new Error("Network error"));

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();

      expect(result).toContain("SonarQube Setup Error");
      expect(result).toContain("Network error");

      needsBootstrapSpy.mockRestore();
      bootstrapSpy.mockRestore();
    });

    test("returns undefined when in cooldown period", async () => {
      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(false);

      // Simulate a recent analysis by calling the hook twice
      // First, add an edited file so the first call will run
      const fileHook = createFileEditedHook();
      fileHook({ filePath: "src/test.ts" });

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState");
      const mockState = createMockProjectState({
        lastAnalysis: new Date().toISOString(),
      });
      getProjectStateSpy.mockResolvedValue(mockState);

      const runAnalysisSpy = spyOn(scannerModule, "runAnalysis");
      const mockResult: AnalysisResult = {
        success: true,
        qualityGateStatus: "OK",
        issues: { total: 0, blocker: 0, critical: 0, major: 0, minor: 0, info: 0 },
        metrics: {},
        formattedIssues: [],
        timestamp: new Date().toISOString(),
      };
      runAnalysisSpy.mockResolvedValue(mockResult);

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      // First call triggers analysis
      await hook();

      // Reset and add file again
      fileHook({ filePath: "src/test2.ts" });

      // Second call should be in cooldown
      const result = await hook();
      expect(result).toBeUndefined();

      needsBootstrapSpy.mockRestore();
      getProjectStateSpy.mockRestore();
      runAnalysisSpy.mockRestore();
    });

    test("returns undefined when no edited files", async () => {
      resetAnalysisCooldown();
      clearEditedFiles();

      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(false);

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();
      expect(result).toBeUndefined();

      needsBootstrapSpy.mockRestore();
    });

    test("returns undefined when project state is not found", async () => {
      resetAnalysisCooldown();
      clearEditedFiles();

      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(false);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState");
      getProjectStateSpy.mockResolvedValue(null);

      const fileHook = createFileEditedHook();
      fileHook({ filePath: "src/test.ts" });

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();
      expect(result).toBeUndefined();

      needsBootstrapSpy.mockRestore();
      getProjectStateSpy.mockRestore();
    });

    test("runs analysis and returns formatted results with issues", async () => {
      resetAnalysisCooldown();
      clearEditedFiles();

      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(false);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState");
      const mockState = createMockProjectState({
        lastAnalysis: new Date().toISOString(),
      });
      getProjectStateSpy.mockResolvedValue(mockState);

      const runAnalysisSpy = spyOn(scannerModule, "runAnalysis");
      const mockResult: AnalysisResult = {
        success: true,
        qualityGateStatus: "ERROR",
        issues: { total: 2, blocker: 1, critical: 1, major: 0, minor: 0, info: 0 },
        metrics: { bugs: 1, vulnerabilities: 1 },
        formattedIssues: [
          {
            key: "issue-1",
            severity: "BLOCKER",
            type: "BUG",
            rule: "ts:S123",
            message: "Critical bug found",
            file: "src/app.ts",
            line: 10,
            quickFixAvailable: false,
          },
        ],
        timestamp: new Date().toISOString(),
      };
      runAnalysisSpy.mockResolvedValue(mockResult);

      const fileHook = createFileEditedHook();
      fileHook({ filePath: "src/app.ts" });

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();

      expect(result).toBeDefined();
      expect(result).toContain("SonarQube Analysis Results");
      expect(result).toContain("Action Required");
      expect(result).toContain("1 blocker(s) and 1 critical issue(s)");
      expect(result).toContain("Please review and fix these issues");

      needsBootstrapSpy.mockRestore();
      getProjectStateSpy.mockRestore();
      runAnalysisSpy.mockRestore();
    });

    test("returns undefined when analysis succeeds with no issues", async () => {
      resetAnalysisCooldown();
      clearEditedFiles();

      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(false);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState");
      const mockState = createMockProjectState({
        lastAnalysis: new Date().toISOString(),
      });
      getProjectStateSpy.mockResolvedValue(mockState);

      const runAnalysisSpy = spyOn(scannerModule, "runAnalysis");
      const mockResult: AnalysisResult = {
        success: true,
        qualityGateStatus: "OK",
        issues: { total: 0, blocker: 0, critical: 0, major: 0, minor: 0, info: 0 },
        metrics: {},
        formattedIssues: [],
        timestamp: new Date().toISOString(),
      };
      runAnalysisSpy.mockResolvedValue(mockResult);

      const fileHook = createFileEditedHook();
      fileHook({ filePath: "src/app.ts" });

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();
      expect(result).toBeUndefined();

      needsBootstrapSpy.mockRestore();
      getProjectStateSpy.mockRestore();
      runAnalysisSpy.mockRestore();
    });

    test("returns undefined when analysis throws an error", async () => {
      resetAnalysisCooldown();
      clearEditedFiles();

      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(false);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState");
      const mockState = createMockProjectState({
        lastAnalysis: new Date().toISOString(),
      });
      getProjectStateSpy.mockResolvedValue(mockState);

      const runAnalysisSpy = spyOn(scannerModule, "runAnalysis");
      runAnalysisSpy.mockRejectedValue(new Error("Scanner failed"));

      const fileHook = createFileEditedHook();
      fileHook({ filePath: "src/app.ts" });

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();
      expect(result).toBeUndefined();

      needsBootstrapSpy.mockRestore();
      getProjectStateSpy.mockRestore();
      runAnalysisSpy.mockRestore();
    });

    test("handles bootstrap error when error is not an Error instance", async () => {
      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(true);

      const bootstrapSpy = spyOn(bootstrapModule, "bootstrap");
      bootstrapSpy.mockRejectedValue("String error message");

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();

      expect(result).toContain("SonarQube Setup Error");
      expect(result).toContain("String error message");

      needsBootstrapSpy.mockRestore();
      bootstrapSpy.mockRestore();
    });

    test("formats bootstrap message without quality gate", async () => {
      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(true);

      const bootstrapSpy = spyOn(bootstrapModule, "bootstrap");
      const mockBootstrapResult = createMockBootstrapResult({
        // No qualityGate
      });
      bootstrapSpy.mockResolvedValue(mockBootstrapResult);

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();

      expect(result).toContain("SonarQube Integration Initialized");
      expect(result).not.toContain("Quality Gate:");

      needsBootstrapSpy.mockRestore();
      bootstrapSpy.mockRestore();
    });

    test("uses projectName from config when available", async () => {
      resetAnalysisCooldown();
      clearEditedFiles();

      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(false);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState");
      const mockState = createMockProjectState({
        lastAnalysis: new Date().toISOString(),
      });
      getProjectStateSpy.mockResolvedValue(mockState);

      const runAnalysisSpy = spyOn(scannerModule, "runAnalysis");
      runAnalysisSpy.mockResolvedValue({
        success: true,
        qualityGateStatus: "OK",
        issues: { total: 0, blocker: 0, critical: 0, major: 0, minor: 0, info: 0 },
        metrics: {},
        formattedIssues: [],
        timestamp: new Date().toISOString(),
      });

      const fileHook = createFileEditedHook();
      fileHook({ filePath: "src/app.ts" });

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
            projectName: "My Custom Project Name",
          },
        }),
        () => "/tmp/test-project"
      );

      await hook();

      expect(runAnalysisSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          projectName: "My Custom Project Name",
        }),
        expect.anything()
      );

      needsBootstrapSpy.mockRestore();
      getProjectStateSpy.mockRestore();
      runAnalysisSpy.mockRestore();
    });

    test("handles result with issues but no blockers or criticals (no action prompt)", async () => {
      resetAnalysisCooldown();
      clearEditedFiles();

      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(false);

      const getProjectStateSpy = spyOn(bootstrapModule, "getProjectState");
      const mockState = createMockProjectState({
        lastAnalysis: new Date().toISOString(),
      });
      getProjectStateSpy.mockResolvedValue(mockState);

      const runAnalysisSpy = spyOn(scannerModule, "runAnalysis");
      const mockResult: AnalysisResult = {
        success: true,
        qualityGateStatus: "ERROR", // Gate failed but only minor issues
        issues: { total: 5, blocker: 0, critical: 0, major: 3, minor: 2, info: 0 },
        metrics: {},
        formattedIssues: [
          {
            key: "issue-3",
            severity: "MAJOR",
            type: "CODE_SMELL",
            rule: "ts:S456",
            message: "Code smell",
            file: "src/app.ts",
            line: 10,
            quickFixAvailable: false,
          },
        ],
        timestamp: new Date().toISOString(),
      };
      runAnalysisSpy.mockResolvedValue(mockResult);

      const fileHook = createFileEditedHook();
      fileHook({ filePath: "src/app.ts" });

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      const result = await hook();

      expect(result).toBeDefined();
      expect(result).toContain("SonarQube Analysis Results");
      // Should not have "Action Required" since no blockers/criticals
      expect(result).not.toContain("Action Required");

      needsBootstrapSpy.mockRestore();
      getProjectStateSpy.mockRestore();
      runAnalysisSpy.mockRestore();
    });

    test("skips bootstrap when already in progress", async () => {
      const needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      needsBootstrapSpy.mockResolvedValue(true);

      // Create a bootstrap that takes time
      let resolveBootstrap: (value: BootstrapResult) => void;
      const bootstrapPromise = new Promise<BootstrapResult>((resolve) => {
        resolveBootstrap = resolve;
      });

      const bootstrapSpy = spyOn(bootstrapModule, "bootstrap");
      bootstrapSpy.mockReturnValue(bootstrapPromise);

      const hook = createIdleHook(
        () => ({
          sonarqube: {
            url: "http://example.com",
            user: "admin",
            password: "admin",
            level: "enterprise",
            autoAnalyze: true,
          },
        }),
        () => "/tmp/test-project"
      );

      // Start first call (bootstrap begins)
      const firstCall = hook();

      // Second call should return undefined (bootstrap in progress)
      const secondResult = await hook();
      expect(secondResult).toBeUndefined();

      // Resolve the first bootstrap
      resolveBootstrap!(createMockBootstrapResult({
        message: "Done",
      }));

      await firstCall;

      needsBootstrapSpy.mockRestore();
      bootstrapSpy.mockRestore();
    });
  });
});
