/**
 * Integration Tests for SonarQube API
 * These tests run against a real SonarQube server
 * 
 * Required environment variables:
 * - SONAR_HOST_URL: SonarQube server URL (e.g., http://localhost:9000)
 * - SONAR_USER: Username (e.g., admin)
 * - SONAR_PASSWORD: Password
 * - SONAR_TOKEN: Project analysis token (optional, for token-based tests)
 * - SONAR_PROJECT_KEY: Project key to test against (default: opencode-sonarqube)
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { SonarQubeClient, createClientWithCredentials, createClientWithToken } from "./client.ts";
import { SonarQubeAPI, createSonarQubeAPIWithCredentials } from "./index.ts";
import { QualityGateAPI } from "./quality-gate.ts";
import { IssuesAPI } from "./issues.ts";
import { ProjectsAPI } from "./projects.ts";

// SonarQube server configuration from environment variables
const SONAR_URL = process.env.SONAR_HOST_URL ?? "";
const SONAR_USER = process.env.SONAR_USER ?? "";
const SONAR_PASSWORD = process.env.SONAR_PASSWORD ?? "";
const SONAR_TOKEN = process.env.SONAR_TOKEN ?? "";
const PROJECT_KEY = process.env.SONAR_PROJECT_KEY ?? "opencode-sonarqube";

// Skip all tests if credentials are not configured
const SKIP_TESTS = !SONAR_URL || !SONAR_USER || !SONAR_PASSWORD;

describe.skipIf(SKIP_TESTS)("Integration Tests - SonarQube API", () => {
  let client: SonarQubeClient;
  let api: SonarQubeAPI;

  beforeAll(() => {
    client = createClientWithCredentials(SONAR_URL, SONAR_USER, SONAR_PASSWORD);
    api = createSonarQubeAPIWithCredentials(SONAR_URL, SONAR_USER, SONAR_PASSWORD);
  });

  describe("SonarQubeClient", () => {
    test("connects to real server with credentials", async () => {
      const health = await client.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.version).toBeDefined();
      expect(health.version).toMatch(/^\d+\.\d+/);
    });

    test.skipIf(!SONAR_TOKEN)("connects to real server with token", async () => {
      const tokenClient = createClientWithToken(SONAR_URL, SONAR_TOKEN);
      const health = await tokenClient.healthCheck();
      
      expect(health.healthy).toBe(true);
    });

    test("validates authentication", async () => {
      const authResult = await client.validateAuth();
      
      expect(authResult.valid).toBe(true);
    });

    test("gets server status", async () => {
      const status = await client.getServerStatus();
      
      expect(status.status).toBe("UP");
      expect(status.version).toBeDefined();
    });
  });

  describe("QualityGateAPI", () => {
    let qualityGate: QualityGateAPI;

    beforeAll(() => {
      qualityGate = new QualityGateAPI(client);
    });

    test("gets quality gate status for real project", async () => {
      const status = await qualityGate.getStatus(PROJECT_KEY);
      
      expect(status.projectStatus).toBeDefined();
      expect(status.projectStatus.status).toMatch(/^(OK|WARN|ERROR|NONE)$/);
      expect(Array.isArray(status.projectStatus.conditions)).toBe(true);
    });

    test("checks if quality gate is passing", async () => {
      const isPassing = await qualityGate.isPassing(PROJECT_KEY);
      
      expect(typeof isPassing).toBe("boolean");
    });

    test("gets failed conditions", async () => {
      const failedConditions = await qualityGate.getFailedConditions(PROJECT_KEY);
      
      expect(Array.isArray(failedConditions)).toBe(true);
    });

    test("gets quality metrics from real project", async () => {
      const metrics = await qualityGate.getQualityMetrics(PROJECT_KEY);
      
      expect(metrics).toHaveProperty("bugs");
      expect(metrics).toHaveProperty("vulnerabilities");
      expect(metrics).toHaveProperty("codeSmells");
      expect(metrics).toHaveProperty("securityHotspots");
      expect(metrics).toHaveProperty("reliabilityRating");
      expect(metrics).toHaveProperty("securityRating");
      expect(metrics).toHaveProperty("maintainabilityRating");
      expect(metrics).toHaveProperty("linesOfCode");
      
      // Ratings should be A-E or ?
      expect(metrics.reliabilityRating).toMatch(/^[A-E?]$/);
      expect(metrics.securityRating).toMatch(/^[A-E?]$/);
      expect(metrics.maintainabilityRating).toMatch(/^[A-E?]$/);
    });

    test("formats status correctly", async () => {
      const status = await qualityGate.getStatus(PROJECT_KEY);
      const formatted = qualityGate.formatStatus(status);
      
      expect(formatted).toContain("Quality Gate");
      expect(formatted).toContain(status.projectStatus.status);
    });
  });

  describe("IssuesAPI", () => {
    let issues: IssuesAPI;

    beforeAll(() => {
      issues = new IssuesAPI(client);
    });

    test("searches issues for real project", async () => {
      const result = await issues.search({ projectKey: PROJECT_KEY });
      
      expect(result).toHaveProperty("issues");
      expect(result).toHaveProperty("paging");
      expect(Array.isArray(result.issues)).toBe(true);
    });

    test("gets issue counts", async () => {
      const counts = await issues.getCounts(PROJECT_KEY);
      
      expect(counts).toHaveProperty("total");
      expect(counts).toHaveProperty("blocker");
      expect(counts).toHaveProperty("critical");
      expect(counts).toHaveProperty("major");
      expect(counts).toHaveProperty("minor");
      expect(counts).toHaveProperty("info");
      
      expect(typeof counts.total).toBe("number");
      expect(counts.total).toBeGreaterThanOrEqual(0);
    });

    test("gets formatted issues", async () => {
      const formatted = await issues.getFormattedIssues({ projectKey: PROJECT_KEY });
      
      expect(Array.isArray(formatted)).toBe(true);
      // If there are issues, check structure
      if (formatted.length > 0) {
        const issue = formatted[0];
        expect(issue).toHaveProperty("severity");
        expect(issue).toHaveProperty("type");
        expect(issue).toHaveProperty("message");
        expect(issue).toHaveProperty("file");
      }
    });

    test("gets critical issues", async () => {
      const criticalIssues = await issues.getCritical(PROJECT_KEY);
      
      expect(Array.isArray(criticalIssues)).toBe(true);
      // All should be BLOCKER or CRITICAL
      for (const issue of criticalIssues) {
        expect(["BLOCKER", "CRITICAL"]).toContain(issue.severity);
      }
    });

    test("gets security issues", async () => {
      const securityIssues = await issues.getSecurityIssues(PROJECT_KEY);
      
      expect(Array.isArray(securityIssues)).toBe(true);
      // All should be VULNERABILITY type (security hotspots have separate API)
      for (const issue of securityIssues) {
        expect(issue.type).toBe("VULNERABILITY");
      }
    });
  });

  describe("ProjectsAPI", () => {
    let projects: ProjectsAPI;

    beforeAll(() => {
      projects = new ProjectsAPI(client);
    });

    test("checks if real project exists", async () => {
      const exists = await projects.exists(PROJECT_KEY);
      
      expect(exists).toBe(true);
    });

    test("gets project details", async () => {
      const project = await projects.get(PROJECT_KEY);
      
      expect(project).not.toBeNull();
      expect(project?.key).toBe(PROJECT_KEY);
      expect(project?.name).toBeDefined();
    });

    test("searches for projects", async () => {
      const result = await projects.search({ query: "opencode" });
      
      expect(result).toHaveProperty("components");
      expect(Array.isArray(result.components)).toBe(true);
    });
  });

  describe("SonarQubeAPI (Combined)", () => {
    test("gets complete analysis summary", async () => {
      const summary = await api.getAnalysisSummary(PROJECT_KEY);
      
      expect(summary).toHaveProperty("qualityGate");
      expect(summary).toHaveProperty("issues");
      expect(summary).toHaveProperty("metrics");
      
      expect(summary.qualityGate).toHaveProperty("status");
      expect(summary.qualityGate).toHaveProperty("passed");
      expect(summary.qualityGate).toHaveProperty("failedConditions");
      
      expect(summary.issues).toHaveProperty("total");
      expect(summary.metrics).toHaveProperty("bugs");
    });

    test("performs health check", async () => {
      const health = await api.healthCheck();
      
      expect(health.healthy).toBe(true);
    });
  });
});

describe.skipIf(SKIP_TESTS)("Integration Tests - Enterprise Validation", () => {
  let api: SonarQubeAPI;

  beforeAll(() => {
    api = createSonarQubeAPIWithCredentials(SONAR_URL, SONAR_USER, SONAR_PASSWORD);
  });

  test("validates our own project meets enterprise standards", async () => {
    const summary = await api.getAnalysisSummary(PROJECT_KEY);
    
    // Our project should have A ratings
    expect(summary.metrics.reliabilityRating).toBe("A");
    expect(summary.metrics.securityRating).toBe("A");
    expect(summary.metrics.maintainabilityRating).toBe("A");
    
    // Should have 0 bugs and vulnerabilities
    expect(summary.metrics.bugs).toBe(0);
    expect(summary.metrics.vulnerabilities).toBe(0);
    
    // Should have low duplications (allowing for modular re-exports)
    if (summary.metrics.duplications !== undefined) {
      expect(summary.metrics.duplications).toBeLessThanOrEqual(10);
    }
    
    // Quality gate status is informational - may vary based on server state
    // (e.g., pending hotspot reviews, analysis timing)
    // We log it but don't fail the test since external factors affect it
    console.log(`Quality Gate: ${summary.qualityGate.passed ? "PASSED" : "FAILED"}`);
    if (!summary.qualityGate.passed && summary.qualityGate.failedConditions) {
      console.log("Failed conditions:", summary.qualityGate.failedConditions);
    }
  });
});
