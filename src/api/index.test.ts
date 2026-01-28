/**
 * Tests for SonarQube API Module
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  SonarQubeAPI,
  createSonarQubeAPIWithCredentials,
  createSonarQubeAPIWithToken,
  createSonarQubeAPI,
} from "./index.ts";
import { SonarQubeClient } from "./client.ts";

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("SonarQubeAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let client: SonarQubeClient;
  let api: SonarQubeAPI;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: "UP", version: "10.0" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    client = new SonarQubeClient({
      url: "https://sonar.example.com",
      auth: { token: "test-token" },
    });
    api = new SonarQubeAPI(client);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    test("initializes all API modules", () => {
      expect(api.client).toBe(client);
      expect(api.projects).toBeDefined();
      expect(api.issues).toBeDefined();
      expect(api.qualityGate).toBeDefined();
    });
  });

  describe("getAnalysisSummary", () => {
    test("returns complete analysis summary", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          // Quality gate status
          return Promise.resolve(
            new Response(
              JSON.stringify({
                projectStatus: {
                  status: "OK",
                  conditions: [
                    { status: "OK", metricKey: "coverage" },
                    { status: "ERROR", metricKey: "bugs" },
                  ],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        if (callCount === 2) {
          // Issue counts - first page
          return Promise.resolve(
            new Response(
              JSON.stringify({
                issues: [
                  { key: "1", severity: "BLOCKER" },
                  { key: "2", severity: "CRITICAL" },
                  { key: "3", severity: "MAJOR" },
                ],
                components: [],
                paging: { pageIndex: 1, pageSize: 500, total: 3 },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        // Metrics
        return Promise.resolve(
          new Response(
            JSON.stringify({
              component: {
                key: "my-project",
                measures: [
                  { metric: "coverage", value: "85.0" },
                  { metric: "duplicated_lines_density", value: "2.0" },
                  { metric: "bugs", value: "5" },
                  { metric: "vulnerabilities", value: "2" },
                  { metric: "code_smells", value: "10" },
                  { metric: "security_hotspots", value: "1" },
                  { metric: "reliability_rating", value: "1" },
                  { metric: "security_rating", value: "2" },
                  { metric: "sqale_rating", value: "1" },
                  { metric: "ncloc", value: "5000" },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getAnalysisSummary("my-project");

      expect(result.qualityGate.status).toBe("OK");
      expect(result.qualityGate.passed).toBe(true);
      expect(result.qualityGate.failedConditions).toBe(1);
      expect(result.issues.total).toBe(3);
      expect(result.issues.blocker).toBe(1);
      expect(result.issues.critical).toBe(1);
      expect(result.issues.major).toBe(1);
      expect(result.metrics.coverage).toBe(85.0);
      expect(result.metrics.bugs).toBe(5);
      expect(result.metrics.reliabilityRating).toBe("A");
    });
  });
});

describe("Factory Functions", () => {
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("createSonarQubeAPIWithCredentials", () => {
    test("creates API with user/password auth", () => {
      const api = createSonarQubeAPIWithCredentials(
        "https://sonar.example.com",
        "admin",
        "password123"
      );

      expect(api).toBeInstanceOf(SonarQubeAPI);
      expect(api.client.getBaseUrl()).toBe("https://sonar.example.com");
    });
  });

  describe("createSonarQubeAPIWithToken", () => {
    test("creates API with token auth", () => {
      const api = createSonarQubeAPIWithToken(
        "https://sonar.example.com",
        "sqp_token123"
      );

      expect(api).toBeInstanceOf(SonarQubeAPI);
      expect(api.client.getBaseUrl()).toBe("https://sonar.example.com");
    });
  });

  describe("createSonarQubeAPI", () => {
    test("creates API from config and state", () => {
      const config = {
        url: "https://sonar.example.com",
        user: "admin",
        password: "admin",
        level: "enterprise" as const,
        autoAnalyze: false,
        newCodeDefinition: "previous_version" as const,
        sources: "src",
      };
      const state = {
        version: 1,
        projectKey: "my-project",
        projectToken: "sqp_token123",
        tokenName: "token",
        languages: ["typescript"],
        qualityGate: "Sonar way",
        setupComplete: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        initializedAt: new Date().toISOString(),
      };

      const api = createSonarQubeAPI(config, state);

      expect(api).toBeInstanceOf(SonarQubeAPI);
      expect(api.client.getBaseUrl()).toBe("https://sonar.example.com");
    });
  });
});
