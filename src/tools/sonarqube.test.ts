/**
 * Tests for SonarQube Tool
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import {
  SonarQubeToolArgsSchema,
  executeSonarQubeTool,
  createSonarQubeTool,
} from "./sonarqube.ts";
import * as configModule from "../utils/config.ts";
import * as bootstrapModule from "../bootstrap/index.ts";
import * as scannerModule from "../scanner/index.ts";
import * as apiModule from "../api/index.ts";
import type { SonarQubeConfig, ProjectState } from "../types/index.ts";

// Helper to create valid config
const createMockConfig = (overrides?: Record<string, unknown>): SonarQubeConfig => ({
  url: "http://example.com",
  user: "admin",
  password: "admin",
  level: "enterprise",
  autoAnalyze: true,
  sources: "src",
  newCodeDefinition: "previous_version",
  ...overrides,
});

// Helper to create valid project state
const createMockState = (overrides?: Partial<ProjectState>): ProjectState => ({
  projectKey: "test-project",
  projectToken: "sqp_token123",
  tokenName: "test-token",
  initializedAt: new Date().toISOString(),
  languages: ["typescript"],
  setupComplete: true,
  ...overrides,
});

// Helper to create mock API - using 'any' to allow flexible mocking
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createMockAPI = (): any => ({
  issues: {
    getFormattedIssues: async () => [],
    getCounts: async () => ({
      total: 0,
      blocker: 0,
      critical: 0,
      major: 0,
      minor: 0,
      info: 0,
    }),
    getSecurityHotspots: async () => [],
  },
  qualityGate: {
    getStatus: async () => ({
      projectStatus: {
        status: "OK",
        conditions: [],
      },
    }),
    getQualityMetrics: async () => ({
      coverage: 85,
      duplications: 0,
      bugs: 0,
      vulnerabilities: 0,
      codeSmells: 0,
      securityHotspots: 0,
      reliabilityRating: "A",
      securityRating: "A",
      maintainabilityRating: "A",
      linesOfCode: 1000,
    }),
    validateEnterpriseQuality: async () => ({
      passed: true,
      projectKey: "test-project",
      level: "enterprise",
      summary: "All checks passed",
      checks: [],
      metrics: {
        coverage: 85,
        duplications: 0,
        bugs: 0,
        vulnerabilities: 0,
        codeSmells: 0,
        securityHotspots: 0,
        reliabilityRating: "A",
        securityRating: "A",
        maintainabilityRating: "A",
        linesOfCode: 1000,
      },
      timestamp: new Date().toISOString(),
    }),
    formatEnterpriseValidation: () => "## Validation Result\n\nAll checks passed.",
  },
  sources: {
    getIssuesWithContext: async () => [],
    formatIssueWithContext: () => "### CRITICAL: Test issue\n**File:** `src/test.ts`:10",
  },
  duplications: {
    getProjectDuplications: async () => [],
    formatForAgent: () => "No duplications found.",
  },
  rules: {
    getRule: async () => undefined,
    formatRuleForAgent: () => "Rule not found.",
  },
  analyses: {
    getAnalyses: async () => [],
    getLatestAnalysis: async () => undefined,
    formatAnalysesForAgent: () => "No analysis history found.",
  },
  profiles: {
    getProjectProfiles: async () => [],
    getAllProfiles: async () => [],
    getInheritance: async () => undefined,
    formatProfilesForAgent: () => "No profiles found.",
  },
  branches: {
    getBranches: async () => [],
    getMainBranch: async () => undefined,
    getBranch: async () => undefined,
    deleteBranch: async () => true,
    renameMainBranch: async () => true,
    formatBranchesForAgent: () => "No branches found.",
  },
  metrics: {
    getMetricDefinitions: async () => [],
    getMeasures: async () => [],
    getMeasuresWithPeriod: async () => [],
    formatMeasuresForAgent: () => "No metrics available.",
  },
  components: {
    getTree: async () => ({ paging: { pageIndex: 1, pageSize: 100, total: 0 }, baseComponent: { key: "test", name: "test", qualifier: "TRK" }, components: [] }),
    getWorstFiles: async () => [],
    getWorstDirectories: async () => [],
    formatWorstFilesForAgent: () => "No files with issues found.",
  },
});

describe("SonarQube Tool", () => {
  describe("SonarQubeToolArgsSchema", () => {
    test("validates action enum", () => {
      const validActions = ["analyze", "issues", "newissues", "status", "init", "setup", "validate", "hotspots", "duplications", "rule", "history", "profile", "branches", "metrics", "worstfiles"];
      for (const action of validActions) {
        const result = SonarQubeToolArgsSchema.safeParse({ action });
        expect(result.success).toBe(true);
      }
    });

    test("rejects invalid action", () => {
      const result = SonarQubeToolArgsSchema.safeParse({ action: "invalid" });
      expect(result.success).toBe(false);
    });

    test("applies default values", () => {
      const result = SonarQubeToolArgsSchema.parse({ action: "analyze" });
      expect(result.scope).toBe("all");
      expect(result.severity).toBe("all");
      expect(result.fix).toBe(false);
      expect(result.force).toBe(false);
    });

    test("validates scope enum", () => {
      const validScopes = ["all", "new", "changed"];
      for (const scope of validScopes) {
        const result = SonarQubeToolArgsSchema.safeParse({ action: "analyze", scope });
        expect(result.success).toBe(true);
      }
    });

    test("rejects invalid scope", () => {
      const result = SonarQubeToolArgsSchema.safeParse({ action: "analyze", scope: "invalid" });
      expect(result.success).toBe(false);
    });

    test("validates severity enum", () => {
      const validSeverities = ["blocker", "critical", "major", "minor", "info", "all"];
      for (const severity of validSeverities) {
        const result = SonarQubeToolArgsSchema.safeParse({ action: "issues", severity });
        expect(result.success).toBe(true);
      }
    });

    test("rejects invalid severity", () => {
      const result = SonarQubeToolArgsSchema.safeParse({ action: "issues", severity: "invalid" });
      expect(result.success).toBe(false);
    });

    test("accepts optional projectKey", () => {
      const result = SonarQubeToolArgsSchema.parse({
        action: "analyze",
        projectKey: "my-project",
      });
      expect(result.projectKey).toBe("my-project");
    });

    test("accepts optional force flag", () => {
      const result = SonarQubeToolArgsSchema.parse({
        action: "setup",
        force: true,
      });
      expect(result.force).toBe(true);
    });

    test("accepts fix flag", () => {
      const result = SonarQubeToolArgsSchema.parse({
        action: "analyze",
        fix: true,
      });
      expect(result.fix).toBe(true);
    });
  });

  describe("executeSonarQubeTool", () => {
    let loadConfigSpy: ReturnType<typeof spyOn>;
    let needsBootstrapSpy: ReturnType<typeof spyOn>;
    let bootstrapSpy: ReturnType<typeof spyOn>;
    let getProjectStateSpy: ReturnType<typeof spyOn>;
    let createSonarQubeAPISpy: ReturnType<typeof spyOn>;
    let runAnalysisSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      loadConfigSpy = spyOn(configModule, "loadConfig");
      needsBootstrapSpy = spyOn(bootstrapModule, "needsBootstrap");
      bootstrapSpy = spyOn(bootstrapModule, "bootstrap");
      getProjectStateSpy = spyOn(bootstrapModule, "getProjectState");
      createSonarQubeAPISpy = spyOn(apiModule, "createSonarQubeAPI");
      runAnalysisSpy = spyOn(scannerModule, "runAnalysis");
    });

    afterEach(() => {
      loadConfigSpy.mockRestore();
      needsBootstrapSpy.mockRestore();
      bootstrapSpy.mockRestore();
      getProjectStateSpy.mockRestore();
      createSonarQubeAPISpy.mockRestore();
      runAnalysisSpy.mockRestore();
    });

    test("returns error when config is not found", async () => {
      loadConfigSpy.mockReturnValue(null);

      const result = await executeSonarQubeTool(
        { action: "analyze", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Error");
      expect(result).toContain("configuration not found");
    });

    test("handles setup action successfully with new project", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      bootstrapSpy.mockResolvedValue({
        success: true,
        projectKey: "test-project",
        projectToken: "token",
        languages: ["typescript"],
        isNewProject: true,
        message: "Project created successfully",
      });

      const result = await executeSonarQubeTool(
        { action: "setup", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Project Initialized");
      expect(result).toContain("test-project");
      expect(result).toContain("new project was created");
    });

    test("handles setup action with existing project", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      bootstrapSpy.mockResolvedValue({
        success: true,
        projectKey: "test-project",
        projectToken: "token",
        languages: ["typescript", "javascript"],
        isNewProject: false,
        message: "Connected to existing project",
        qualityGate: "Enterprise Quality Gate",
      });

      const result = await executeSonarQubeTool(
        { action: "init", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Project Initialized");
      expect(result).toContain("Enterprise Quality Gate");
      expect(result).toContain("existing project");
      expect(result).toContain("typescript, javascript");
    });

    test("handles setup action failure", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      bootstrapSpy.mockResolvedValue({
        success: false,
        message: "Failed to connect to server",
      });

      const result = await executeSonarQubeTool(
        { action: "setup", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Setup Failed");
      expect(result).toContain("Failed to connect");
    });

    test("auto-bootstraps when project not initialized and succeeds", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(true);
      bootstrapSpy.mockResolvedValue({
        success: true,
        projectKey: "test-project",
        projectToken: "token",
        languages: ["typescript"],
        isNewProject: true,
        message: "Project created",
      });
      getProjectStateSpy.mockResolvedValue(createMockState());
      createSonarQubeAPISpy.mockReturnValue(createMockAPI());

      const result = await executeSonarQubeTool(
        { action: "status", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Status");
      expect(bootstrapSpy).toHaveBeenCalled();
    });

    test("auto-bootstraps when project not initialized and fails", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(true);
      bootstrapSpy.mockResolvedValue({
        success: false,
        message: "Bootstrap failed",
      });

      const result = await executeSonarQubeTool(
        { action: "status", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Setup Failed");
    });

    test("returns error when project state not found", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(null);

      const result = await executeSonarQubeTool(
        { action: "status", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Project not initialized");
    });

    test("handles status action successfully", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());
      createSonarQubeAPISpy.mockReturnValue(createMockAPI());

      const result = await executeSonarQubeTool(
        { action: "status", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Status");
      expect(result).toContain("test-project");
      expect(result).toContain("Coverage");
      expect(result).toContain("Quality Gate");
    });

    test("handles status action with failed conditions", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.qualityGate.getStatus = async () => ({
        projectStatus: {
          status: "ERROR" as const,
          conditions: [
            { status: "ERROR" as const, metricKey: "coverage", comparator: "LT", errorThreshold: "80", actualValue: "50" },
          ],
        },
      });
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "status", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Failed Conditions");
      expect(result).toContain("coverage");
    });

    test("handles issues action with no issues", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());
      createSonarQubeAPISpy.mockReturnValue(createMockAPI());

      const result = await executeSonarQubeTool(
        { action: "issues", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("No issues matching your criteria found");
      expect(result).toContain("Code quality looks good");
    });

    test("handles issues action with issues found", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.issues.getFormattedIssues = async () => [
        {
          key: "issue-1",
          severity: "CRITICAL",
          type: "BUG",
          rule: "typescript:S1234",
          message: "Fix this bug",
          file: "src/app.ts",
          line: 10,
          quickFixAvailable: false,
        },
      ];
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "issues", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Analysis");
    });

    test("handles issues action with fix mode and source context", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.issues.getFormattedIssues = async () => [
        {
          key: "issue-1",
          severity: "BLOCKER",
          type: "BUG",
          rule: "typescript:S1234",
          message: "Critical security flaw",
          file: "src/auth.ts",
          line: 42,
          quickFixAvailable: false,
        },
        {
          key: "issue-2",
          severity: "CRITICAL",
          type: "VULNERABILITY",
          rule: "typescript:S5678",
          message: "SQL injection risk",
          file: "src/db.ts",
          line: 100,
          quickFixAvailable: false,
        },
      ];
      mockAPI.qualityGate.getStatus = async () => ({
        projectStatus: {
          status: "ERROR",
          conditions: [],
        },
      });
      mockAPI.sources.getIssuesWithContext = async () => [
        {
          key: "issue-1",
          severity: "BLOCKER",
          type: "BUG",
          rule: "typescript:S1234",
          message: "Critical security flaw",
          component: "test-project:src/auth.ts",
          line: 42,
          sourceContext: {
            component: "test-project:src/auth.ts",
            startLine: 39,
            endLine: 47,
            lines: [
              { line: 40, code: "function authenticate(user) {" },
              { line: 41, code: "  // Vulnerable code" },
              { line: 42, code: "  return eval(user.input);" },
              { line: 43, code: "}" },
            ],
          },
        },
      ];
      mockAPI.sources.formatIssueWithContext = () => "### BLOCKER: Critical security flaw\n**File:** `src/auth.ts`:42\n```\n  42 | return eval(user.input);\n```";
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "issues", scope: "all", severity: "all", fix: true, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Code Context for Critical Issues");
      expect(result).toContain("Review the following code sections");
    });

    test("handles issues action with fix mode when source context fails", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.issues.getFormattedIssues = async () => [
        {
          key: "issue-1",
          severity: "BLOCKER",
          type: "BUG",
          rule: "typescript:S1234",
          message: "Critical bug",
          file: "src/app.ts",
          line: 10,
          quickFixAvailable: false,
        },
      ];
      mockAPI.qualityGate.getStatus = async () => ({
        projectStatus: {
          status: "ERROR",
          conditions: [],
        },
      });
      // Simulate source context fetch failure
      mockAPI.sources.getIssuesWithContext = async () => {
        throw new Error("Failed to fetch sources");
      };
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "issues", scope: "all", severity: "all", fix: true, force: false },
        { directory: "/tmp" }
      );

      // Should still return issues without crashing, just without context
      expect(result).toContain("SonarQube Analysis");
      expect(result).not.toContain("Code Context for Critical Issues");
    });

    test("handles issues action with severity filter - critical", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      let capturedOptions: Record<string, unknown> | undefined;
      mockAPI.issues.getFormattedIssues = async (options: Record<string, unknown>) => {
        capturedOptions = options;
        return [];
      };
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      await executeSonarQubeTool(
        { action: "issues", scope: "all", severity: "critical", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(capturedOptions?.severities).toEqual(["BLOCKER", "CRITICAL"]);
    });

    test("handles issues action with severity filter - blocker", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      let capturedOptions: Record<string, unknown> | undefined;
      mockAPI.issues.getFormattedIssues = async (options: Record<string, unknown>) => {
        capturedOptions = options;
        return [];
      };
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      await executeSonarQubeTool(
        { action: "issues", scope: "all", severity: "blocker", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(capturedOptions?.severities).toEqual(["BLOCKER"]);
    });

    test("handles issues action with severity filter - major", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      let capturedOptions: Record<string, unknown> | undefined;
      mockAPI.issues.getFormattedIssues = async (options: Record<string, unknown>) => {
        capturedOptions = options;
        return [];
      };
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      await executeSonarQubeTool(
        { action: "issues", scope: "all", severity: "major", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(capturedOptions?.severities).toEqual(["BLOCKER", "CRITICAL", "MAJOR"]);
    });

    test("handles issues action with severity filter - minor", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      let capturedOptions: Record<string, unknown> | undefined;
      mockAPI.issues.getFormattedIssues = async (options: Record<string, unknown>) => {
        capturedOptions = options;
        return [];
      };
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      await executeSonarQubeTool(
        { action: "issues", scope: "all", severity: "minor", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(capturedOptions?.severities).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR"]);
    });

    test("handles issues action with severity filter - info", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      let capturedOptions: Record<string, unknown> | undefined;
      mockAPI.issues.getFormattedIssues = async (options: Record<string, unknown>) => {
        capturedOptions = options;
        return [];
      };
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      await executeSonarQubeTool(
        { action: "issues", scope: "all", severity: "info", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(capturedOptions?.severities).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]);
    });

    test("handles issues action with severity filter - all (default)", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      let capturedOptions: Record<string, unknown> | undefined;
      mockAPI.issues.getFormattedIssues = async (options: Record<string, unknown>) => {
        capturedOptions = options;
        return [];
      };
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      await executeSonarQubeTool(
        { action: "issues", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      // When severity is "all", severities should be undefined (no filter)
      expect(capturedOptions?.severities).toBeUndefined();
    });

    test("handles validate action successfully", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());
      createSonarQubeAPISpy.mockReturnValue(createMockAPI());

      const result = await executeSonarQubeTool(
        { action: "validate", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Validation Result");
      expect(result).toContain("Congratulations");
    });

    test("handles validate action with failures", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.qualityGate.validateEnterpriseQuality = async () => ({
        passed: false,
        projectKey: "test-project",
        level: "enterprise" as const,
        summary: "1 check failed",
        checks: [{ name: "Coverage", passed: false, actual: "50%", expected: ">= 80%", message: "Coverage is below threshold" }],
        metrics: {
          coverage: 50,
          duplications: 0,
          bugs: 0,
          vulnerabilities: 0,
          codeSmells: 0,
          securityHotspots: 0,
          reliabilityRating: "A" as const,
          securityRating: "A" as const,
          maintainabilityRating: "A" as const,
          linesOfCode: 1000,
        },
        timestamp: new Date().toISOString(),
      });
      mockAPI.qualityGate.formatEnterpriseValidation = () => "## Validation Failed";
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "validate", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Action Required");
    });

    test("handles hotspots action with no hotspots", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());
      createSonarQubeAPISpy.mockReturnValue(createMockAPI());

      const result = await executeSonarQubeTool(
        { action: "hotspots", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Security Hotspots");
      expect(result).toContain("No security hotspots found");
    });

    test("handles hotspots action with hotspots found", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.issues.getSecurityHotspots = async () => [
        {
          key: "hs-1",
          component: "test-project:src/auth.ts",
          project: "test-project",
          securityCategory: "sql-injection",
          vulnerabilityProbability: "HIGH",
          status: "TO_REVIEW",
          line: 42,
          message: "Make sure this SQL query is safe",
          creationDate: "2026-01-24T10:00:00Z",
          updateDate: "2026-01-24T10:00:00Z",
        },
        {
          key: "hs-2",
          component: "test-project:src/crypto.ts",
          project: "test-project",
          securityCategory: "weak-cryptography",
          vulnerabilityProbability: "MEDIUM",
          status: "TO_REVIEW",
          line: 15,
          message: "Make sure this cryptographic algorithm is safe here",
          creationDate: "2026-01-24T10:00:00Z",
          updateDate: "2026-01-24T10:00:00Z",
        },
      ];
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "hotspots", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Security Hotspots");
      expect(result).toContain("Total Hotspots");
      expect(result).toContain("Pending Review");
      expect(result).toContain("HIGH");
      expect(result).toContain("MEDIUM");
      expect(result).toContain("Review Guidelines");
    });

    test("handles hotspots action with mixed statuses", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.issues.getSecurityHotspots = async () => [
        {
          key: "hs-1",
          component: "test-project:src/auth.ts",
          project: "test-project",
          securityCategory: "sql-injection",
          vulnerabilityProbability: "HIGH",
          status: "TO_REVIEW",
          line: 42,
          message: "Review this",
          creationDate: "2026-01-24T10:00:00Z",
          updateDate: "2026-01-24T10:00:00Z",
        },
        {
          key: "hs-2",
          component: "test-project:src/safe.ts",
          project: "test-project",
          securityCategory: "weak-cryptography",
          vulnerabilityProbability: "LOW",
          status: "REVIEWED",
          line: 15,
          message: "Already reviewed",
          creationDate: "2026-01-24T10:00:00Z",
          updateDate: "2026-01-24T10:00:00Z",
        },
      ];
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "hotspots", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Total Hotspots:** 2");
      expect(result).toContain("Pending Review:** 1");
      expect(result).toContain("Already Reviewed:** 1");
    });

    test("handles hotspots action with more than 20 hotspots (truncation)", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      // Create 55 hotspots to trigger truncation (limit is 50)
      const hotspots = Array.from({ length: 55 }, (_, i) => ({
        key: `hs-${i}`,
        component: `test-project:src/file${i}.ts`,
        project: "test-project",
        securityCategory: "sql-injection",
        vulnerabilityProbability: "HIGH",
        status: "TO_REVIEW",
        line: i + 1,
        message: `Hotspot ${i}`,
        creationDate: "2026-01-24T10:00:00Z",
        updateDate: "2026-01-24T10:00:00Z",
      }));
      mockAPI.issues.getSecurityHotspots = async () => hotspots;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "hotspots", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("and 5 more hotspots");
    });

    test("handles duplications action with no duplications", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());
      createSonarQubeAPISpy.mockReturnValue(createMockAPI());

      const result = await executeSonarQubeTool(
        { action: "duplications", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Code Duplications");
      expect(result).toContain("No code duplications found");
      expect(result).toContain("DRY");
    });

    test("handles duplications action with duplications found", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.duplications.getProjectDuplications = async () => [
        {
          originalFile: "src/utils.ts",
          originalStartLine: 10,
          originalEndLine: 25,
          duplicateFile: "src/helpers.ts",
          duplicateStartLine: 50,
          duplicateEndLine: 65,
          lines: 15,
        },
      ];
      mockAPI.duplications.formatForAgent = () => "### src/utils.ts\n- Duplicated in src/helpers.ts";
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "duplications", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Code Duplications");
      expect(result).toContain("Duplications Found:** 1");
      expect(result).toContain("src/utils.ts");
    });

    test("handles rule action without ruleKey", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());
      createSonarQubeAPISpy.mockReturnValue(createMockAPI());

      const result = await executeSonarQubeTool(
        { action: "rule", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Error");
      expect(result).toContain("Missing `ruleKey` parameter");
      expect(result).toContain("typescript:");
    });

    test("handles rule action with valid ruleKey", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.rules.getRule = async () => ({
        key: "typescript:S1234",
        name: "Cognitive Complexity should not be too high",
        description: "This rule detects functions with high cognitive complexity.",
        severity: "CRITICAL",
        type: "CODE_SMELL",
        lang: "ts",
        langName: "TypeScript",
        tags: ["brain-overload", "complexity"],
      });
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "rule", scope: "all", severity: "all", fix: false, force: false, ruleKey: "typescript:S1234" },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Rule:");
      expect(result).toContain("typescript:S1234");
      expect(result).toContain("CRITICAL");
      expect(result).toContain("TypeScript");
      expect(result).toContain("How to Fix");
    });

    test("handles rule action with unknown rule", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.rules.getRule = async () => undefined;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "rule", scope: "all", severity: "all", fix: false, force: false, ruleKey: "unknown:S9999" },
        { directory: "/tmp" }
      );

      expect(result).toContain("Rule Not Found");
      expect(result).toContain("unknown:S9999");
    });

    test("handles rule action with rule without langName", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.rules.getRule = async () => ({
        key: "common:S1234",
        name: "Some common rule",
        description: "A rule that applies to multiple languages.",
        severity: "MAJOR",
        type: "BUG",
        tags: [],
      });
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "rule", scope: "all", severity: "all", fix: false, force: false, ruleKey: "common:S1234" },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Rule:");
      expect(result).toContain("common:S1234");
      expect(result).not.toContain("**Language:**");
    });

    test("handles analyze action successfully", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());
      runAnalysisSpy.mockResolvedValue({
        success: true,
        qualityGateStatus: "OK",
        issues: { total: 0, blocker: 0, critical: 0, major: 0, minor: 0, info: 0 },
        metrics: { coverage: 85, bugs: 0, vulnerabilities: 0, codeSmells: 0 },
        formattedIssues: [],
        timestamp: new Date().toISOString(),
      });

      const result = await executeSonarQubeTool(
        { action: "analyze", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Analysis");
    });

    test("handles analyze action with fix suggestions", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());
      runAnalysisSpy.mockResolvedValue({
        success: true,
        qualityGateStatus: "ERROR",
        issues: { total: 2, blocker: 1, critical: 1, major: 0, minor: 0, info: 0 },
        metrics: {},
        formattedIssues: [
          { severity: "BLOCKER", type: "BUG", rule: "ts:S1", message: "Blocker issue", file: "a.ts", line: 1, quickFixAvailable: false },
          { severity: "CRITICAL", type: "BUG", rule: "ts:S2", message: "Critical issue", file: "b.ts", line: 2, quickFixAvailable: false },
        ],
        timestamp: new Date().toISOString(),
      });

      const result = await executeSonarQubeTool(
        { action: "analyze", scope: "all", severity: "all", fix: true, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Fix Suggestions");
      expect(result).toContain("Immediate Fixes Required");
      expect(result).toContain("High Priority Fixes");
    });

    test("uses custom projectKey when provided", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());
      createSonarQubeAPISpy.mockReturnValue(createMockAPI());

      const result = await executeSonarQubeTool(
        { action: "status", scope: "all", severity: "all", fix: false, force: false, projectKey: "custom-key" },
        { directory: "/tmp" }
      );

      expect(result).toContain("custom-key");
    });

    test("handles exceptions gracefully", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockRejectedValue(new Error("Network error"));

      const result = await executeSonarQubeTool(
        { action: "status", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("SonarQube Error");
      expect(result).toContain("Network error");
      expect(result).toContain("status");
    });

    test("uses process.cwd when directory not provided", async () => {
      loadConfigSpy.mockReturnValue(null);

      const result = await executeSonarQubeTool(
        { action: "analyze", scope: "all", severity: "all", fix: false, force: false },
        {}
      );

      expect(result).toContain("configuration not found");
    });

    test("handles history action successfully", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.analyses = {
        getAnalyses: async () => [
          { key: "a1", date: "2026-01-24T10:00:00Z", events: [], projectVersion: "1.0.0" },
        ],
        getLatestAnalysis: async () => undefined,
        formatAnalysesForAgent: () => "## Analysis History\n\nMocked history",
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "history", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Analysis History");
    });

    test("handles history action with no analyses", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.analyses = {
        getAnalyses: async () => [],
        getLatestAnalysis: async () => undefined,
        formatAnalysesForAgent: () => "No analyses",
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "history", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("No analysis history found");
    });

    test("handles profile action successfully", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.profiles = {
        getProjectProfiles: async () => [
          { key: "p1", name: "Sonar way", language: "ts", languageName: "TypeScript", isBuiltIn: true, isDefault: true, isInherited: false, activeRuleCount: 200, activeDeprecatedRuleCount: 0 },
        ],
        getAllProfiles: async () => [],
        getInheritance: async () => undefined,
        formatProfilesForAgent: () => "## Quality Profiles\n\nMocked profiles",
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "profile", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Quality Profile");
    });

    test("handles profile action with no profiles", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.profiles = {
        getProjectProfiles: async () => [],
        getAllProfiles: async () => [],
        getInheritance: async () => undefined,
        formatProfilesForAgent: () => "No profiles",
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "profile", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("No quality profiles found");
    });

    test("handles branches action successfully", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.branches = {
        getBranches: async () => [
          { name: "main", isMain: true, type: "BRANCH", status: { qualityGateStatus: "OK" } },
        ],
        getMainBranch: async () => undefined,
        getBranch: async () => undefined,
        deleteBranch: async () => true,
        renameMainBranch: async () => true,
        formatBranchesForAgent: () => "## Project Branches\n\nMocked branches",
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "branches", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Project Branches");
    });

    test("handles branches action with no branches", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.branches = {
        getBranches: async () => [],
        getMainBranch: async () => undefined,
        getBranch: async () => undefined,
        deleteBranch: async () => true,
        renameMainBranch: async () => true,
        formatBranchesForAgent: () => "No branches",
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "branches", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("No branch information found");
    });

    test("handles metrics action successfully", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.metrics = {
        getMetricDefinitions: async () => [],
        getMeasures: async () => [],
        getMeasuresWithPeriod: async () => [
          { metric: "ncloc", value: "1000" },
          { metric: "coverage", value: "85.5" },
        ],
        formatMeasuresForAgent: () => "## Code Metrics\n\nMocked metrics",
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "metrics", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Code Metrics");
    });

    test("handles metrics action with no metrics", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.metrics = {
        getMetricDefinitions: async () => [],
        getMeasures: async () => [],
        getMeasuresWithPeriod: async () => [],
        formatMeasuresForAgent: () => "No metrics",
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "metrics", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("No metrics found");
    });

    test("handles newissues action successfully", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.issues = {
        ...mockAPI.issues,
        search: async () => ({
          issues: [
            { key: "i1", severity: "BLOCKER", type: "BUG", rule: "ts:S1234", message: "Fix this", component: "test:src/file.ts", line: 10 },
          ],
          components: [{ key: "test:src/file.ts", path: "src/file.ts", name: "file.ts" }],
          paging: { pageIndex: 1, pageSize: 500, total: 1 },
        }),
        formatIssues: (issues: any[], _components: any[]) => issues.map((i: any) => ({
          key: i.key,
          severity: i.severity,
          type: i.type,
          rule: i.rule,
          message: i.message,
          file: "src/file.ts",
          line: i.line,
        })),
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "newissues", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("New Code Issues");
      expect(result).toContain("BLOCKER");
    });

    test("handles newissues action with no issues", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.issues = {
        ...mockAPI.issues,
        search: async () => ({
          issues: [],
          components: [],
          paging: { pageIndex: 1, pageSize: 500, total: 0 },
        }),
        formatIssues: () => [],
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "newissues", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("No issues in new code");
      expect(result).toContain("clean");
    });

    test("handles worstfiles action successfully", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.components = {
        getTree: async () => ({ paging: { pageIndex: 1, pageSize: 20, total: 1 }, baseComponent: { key: "test", name: "test", qualifier: "TRK" }, components: [] }),
        getWorstFiles: async () => [
          { path: "src/bad.ts", bugs: 5, vulnerabilities: 2, codeSmells: 10, securityHotspots: 1, total: 18 },
        ],
        getWorstDirectories: async () => [],
        formatWorstFilesForAgent: () => "## Files with Most Issues\n\n| File | Bugs | ...",
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "worstfiles", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("Files with Most Issues");
    });

    test("handles worstfiles action with no files", async () => {
      loadConfigSpy.mockReturnValue(createMockConfig());
      needsBootstrapSpy.mockResolvedValue(false);
      getProjectStateSpy.mockResolvedValue(createMockState());

      const mockAPI = createMockAPI();
      mockAPI.components = {
        getTree: async () => ({ paging: { pageIndex: 1, pageSize: 20, total: 0 }, baseComponent: { key: "test", name: "test", qualifier: "TRK" }, components: [] }),
        getWorstFiles: async () => [],
        getWorstDirectories: async () => [],
        formatWorstFilesForAgent: () => "No files with issues",
      } as any;
      createSonarQubeAPISpy.mockReturnValue(mockAPI);

      const result = await executeSonarQubeTool(
        { action: "worstfiles", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(result).toContain("No files with issues");
    });
  });

  describe("createSonarQubeTool", () => {
    test("creates tool with correct structure", () => {
      const tool = createSonarQubeTool(() => undefined);

      expect(tool.sonarqube).toBeDefined();
      expect(tool.sonarqube.description).toBeDefined();
      expect(tool.sonarqube.args).toBeDefined();
      expect(typeof tool.sonarqube.execute).toBe("function");
    });

    test("tool description includes all actions", () => {
      const tool = createSonarQubeTool(() => undefined);

      expect(tool.sonarqube.description).toContain("setup");
      expect(tool.sonarqube.description).toContain("analyze");
      expect(tool.sonarqube.description).toContain("issues");
      expect(tool.sonarqube.description).toContain("status");
      expect(tool.sonarqube.description).toContain("validate");
    });

    test("tool description includes examples", () => {
      const tool = createSonarQubeTool(() => undefined);

      expect(tool.sonarqube.description).toContain("Example usage");
      expect(tool.sonarqube.description).toContain("sonarqube({");
    });

    test("tool args schema is defined for all parameters", () => {
      const tool = createSonarQubeTool(() => undefined);

      expect(tool.sonarqube.args.action).toBeDefined();
      expect(tool.sonarqube.args.scope).toBeDefined();
      expect(tool.sonarqube.args.severity).toBeDefined();
      expect(tool.sonarqube.args.fix).toBeDefined();
      expect(tool.sonarqube.args.projectKey).toBeDefined();
      expect(tool.sonarqube.args.force).toBeDefined();
    });

    test("execute function passes config from getter", async () => {
      const config = { sonarqube: { url: "http://test.com" } };
      const configGetter = () => config;
      const tool = createSonarQubeTool(configGetter);

      // This will return error because full config validation fails
      const result = await tool.sonarqube.execute(
        { action: "status", scope: "all", severity: "all", fix: false, force: false },
        { directory: "/tmp" }
      );

      expect(typeof result).toBe("string");
    });

    test("execute function works with undefined config", async () => {
      // Save and clear env vars to test missing config
      const savedUrl = process.env["SONAR_HOST_URL"];
      const savedUser = process.env["SONAR_USER"];
      const savedPassword = process.env["SONAR_PASSWORD"];
      delete process.env["SONAR_HOST_URL"];
      delete process.env["SONAR_USER"];
      delete process.env["SONAR_PASSWORD"];

      try {
        const tool = createSonarQubeTool(() => undefined);

        const result = await tool.sonarqube.execute(
          { action: "status", scope: "all", severity: "all", fix: false, force: false },
          { directory: "/tmp" }
        );

        expect(result).toContain("configuration not found");
      } finally {
        // Restore env vars
        if (savedUrl) process.env["SONAR_HOST_URL"] = savedUrl;
        if (savedUser) process.env["SONAR_USER"] = savedUser;
        if (savedPassword) process.env["SONAR_PASSWORD"] = savedPassword;
      }
    });
  });
});
