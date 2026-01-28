/**
 * Tests for QualityGateAPI
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { QualityGateAPI, METRIC_KEYS } from "./quality-gate.ts";
import { SonarQubeClient } from "./client.ts";
import type { EnterpriseValidationResult } from "../types/index.ts";

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("QualityGateAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let client: SonarQubeClient;
  let api: QualityGateAPI;

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
    client = new SonarQubeClient({
      url: "https://sonar.example.com",
      auth: { token: "test-token" },
    });
    api = new QualityGateAPI(client);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("METRIC_KEYS", () => {
    test("contains all expected metric keys", () => {
      expect(METRIC_KEYS.coverage).toBe("coverage");
      expect(METRIC_KEYS.bugs).toBe("bugs");
      expect(METRIC_KEYS.vulnerabilities).toBe("vulnerabilities");
      expect(METRIC_KEYS.codeSmells).toBe("code_smells");
      expect(METRIC_KEYS.reliabilityRating).toBe("reliability_rating");
      expect(METRIC_KEYS.securityRating).toBe("security_rating");
      expect(METRIC_KEYS.sqaleRating).toBe("sqale_rating");
      expect(METRIC_KEYS.ncloc).toBe("ncloc");
      expect(METRIC_KEYS.complexity).toBe("complexity");
      expect(METRIC_KEYS.cognitiveComplexity).toBe("cognitive_complexity");
    });
  });

  describe("getStatus", () => {
    test("fetches quality gate status for a project", async () => {
      const mockResponse = {
        projectStatus: {
          status: "OK",
          conditions: [],
        },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getStatus("my-project");

      expect(result.projectStatus.status).toBe("OK");
      expect(mockFetch).toHaveBeenCalled();
    });

    test("includes branch parameter when provided", async () => {
      const mockResponse = {
        projectStatus: { status: "OK", conditions: [] },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.getStatus("my-project", "feature-branch");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("branch=feature-branch");
    });
  });

  describe("isPassing", () => {
    test("returns true when quality gate status is OK", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              projectStatus: { status: "OK", conditions: [] },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.isPassing("my-project");
      expect(result).toBe(true);
    });

    test("returns false when quality gate status is ERROR", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              projectStatus: { status: "ERROR", conditions: [] },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.isPassing("my-project");
      expect(result).toBe(false);
    });
  });

  describe("getFailedConditions", () => {
    test("returns only non-OK conditions", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              projectStatus: {
                status: "ERROR",
                conditions: [
                  { status: "OK", metricKey: "coverage" },
                  { status: "ERROR", metricKey: "bugs" },
                  { status: "WARN", metricKey: "code_smells" },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getFailedConditions("my-project");

      expect(result).toHaveLength(2);
      expect(result[0].metricKey).toBe("bugs");
      expect(result[1].metricKey).toBe("code_smells");
    });
  });

  describe("getMeasures", () => {
    test("fetches measures with joined metric keys", async () => {
      const mockResponse = {
        component: {
          key: "my-project",
          measures: [{ metric: "coverage", value: "80.5" }],
        },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getMeasures("my-project", ["coverage", "bugs"]);

      expect(result.component.key).toBe("my-project");
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("metricKeys=coverage%2Cbugs");
    });
  });

  describe("getQualityMetrics", () => {
    test("parses all metrics correctly", async () => {
      const mockResponse = {
        component: {
          key: "my-project",
          measures: [
            { metric: "coverage", value: "85.5" },
            { metric: "duplicated_lines_density", value: "2.3" },
            { metric: "bugs", value: "5" },
            { metric: "vulnerabilities", value: "2" },
            { metric: "code_smells", value: "15" },
            { metric: "security_hotspots", value: "1" },
            { metric: "reliability_rating", value: "2" },
            { metric: "security_rating", value: "1" },
            { metric: "sqale_rating", value: "3" },
            { metric: "ncloc", value: "5000" },
          ],
        },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getQualityMetrics("my-project");

      expect(result.coverage).toBe(85.5);
      expect(result.duplications).toBe(2.3);
      expect(result.bugs).toBe(5);
      expect(result.vulnerabilities).toBe(2);
      expect(result.codeSmells).toBe(15);
      expect(result.securityHotspots).toBe(1);
      expect(result.reliabilityRating).toBe("B");
      expect(result.securityRating).toBe("A");
      expect(result.maintainabilityRating).toBe("C");
      expect(result.linesOfCode).toBe(5000);
    });

    test("handles missing metrics gracefully", async () => {
      const mockResponse = {
        component: {
          key: "my-project",
          measures: [],
        },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getQualityMetrics("my-project");

      expect(result.coverage).toBeUndefined();
      expect(result.duplications).toBeUndefined();
      expect(result.bugs).toBe(0);
      expect(result.reliabilityRating).toBe("?");
    });

    test("handles invalid rating values", async () => {
      const mockResponse = {
        component: {
          key: "my-project",
          measures: [{ metric: "reliability_rating", value: "10" }],
        },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getQualityMetrics("my-project");
      expect(result.reliabilityRating).toBe("?");
    });
  });

  describe("formatStatus", () => {
    test("formats OK status correctly", () => {
      const response = {
        projectStatus: {
          status: "OK" as const,
          conditions: [],
        },
      };

      const result = api.formatStatus(response);

      expect(result).toContain("[PASS]");
      expect(result).toContain("OK");
      expect(result).toContain("No conditions evaluated");
    });

    test("formats ERROR status with failed conditions", () => {
      const response = {
        projectStatus: {
          status: "ERROR" as const,
          conditions: [
            {
              status: "ERROR" as const,
              metricKey: "bugs",
              comparator: "GT",
              errorThreshold: "0",
              actualValue: "5",
            },
          ],
        },
      };

      const result = api.formatStatus(response);

      expect(result).toContain("[FAIL]");
      expect(result).toContain("Failed Conditions");
      expect(result).toContain("Bugs");
      expect(result).toContain("5");
    });

    test("formats WARN status correctly", () => {
      const response = {
        projectStatus: {
          status: "WARN" as const,
          conditions: [
            {
              status: "WARN" as const,
              metricKey: "coverage",
              comparator: "LT",
              errorThreshold: "80",
              actualValue: "75",
            },
          ],
        },
      };

      const result = api.formatStatus(response);

      expect(result).toContain("[WARN]");
      expect(result).toContain("Warning Conditions");
    });

    test("shows passed count when there are failures", () => {
      const response = {
        projectStatus: {
          status: "ERROR" as const,
          conditions: [
            { status: "ERROR" as const, metricKey: "bugs", comparator: "GT", errorThreshold: "0", actualValue: "5" },
            { status: "OK" as const, metricKey: "coverage", comparator: "LT", errorThreshold: "80", actualValue: "90" },
            { status: "OK" as const, metricKey: "vulnerabilities", comparator: "GT", errorThreshold: "0", actualValue: "0" },
          ],
        },
      };

      const result = api.formatStatus(response);

      expect(result).toContain("Passed Conditions (2)");
    });

    test("formats different comparators correctly", () => {
      const response = {
        projectStatus: {
          status: "ERROR" as const,
          conditions: [
            { status: "ERROR" as const, metricKey: "bugs", comparator: "GT", errorThreshold: "0", actualValue: "5" },
            { status: "ERROR" as const, metricKey: "coverage", comparator: "LT", errorThreshold: "80", actualValue: "50" },
            { status: "ERROR" as const, metricKey: "rating", comparator: "EQ", errorThreshold: "1", actualValue: "2" },
            { status: "ERROR" as const, metricKey: "test", comparator: "NE", errorThreshold: "0", actualValue: "0" },
          ],
        },
      };

      const result = api.formatStatus(response);

      expect(result).toContain("> 0");
      expect(result).toContain("< 80");
      expect(result).toContain("= 1");
      expect(result).toContain("!= 0");
    });

    test("formats metric names to human readable", () => {
      const response = {
        projectStatus: {
          status: "ERROR" as const,
          conditions: [
            { status: "ERROR" as const, metricKey: "new_coverage", comparator: "LT", errorThreshold: "80", actualValue: "50" },
            { status: "ERROR" as const, metricKey: "duplicated_lines_density", comparator: "GT", errorThreshold: "5", actualValue: "10" },
            { status: "ERROR" as const, metricKey: "security_review_rating", comparator: "GT", errorThreshold: "1", actualValue: "3" },
            { status: "ERROR" as const, metricKey: "unknown_metric", comparator: "GT", errorThreshold: "0", actualValue: "1" },
          ],
        },
      };

      const result = api.formatStatus(response);

      expect(result).toContain("Coverage on New Code");
      expect(result).toContain("Duplicated Lines (%)");
      expect(result).toContain("Security Review Rating");
      expect(result).toContain("unknown_metric"); // Falls back to key
    });
  });

  describe("validateEnterpriseQuality", () => {
    test("validates project against enterprise thresholds - all passing", async () => {
      const mockResponse = {
        component: {
          key: "my-project",
          measures: [
            { metric: "coverage", value: "85.5" },
            { metric: "duplicated_lines_density", value: "0" },
            { metric: "bugs", value: "0" },
            { metric: "vulnerabilities", value: "0" },
            { metric: "code_smells", value: "0" },
            { metric: "security_hotspots", value: "0" },
            { metric: "reliability_rating", value: "1" },
            { metric: "security_rating", value: "1" },
            { metric: "sqale_rating", value: "1" },
            { metric: "ncloc", value: "5000" },
          ],
        },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.validateEnterpriseQuality("my-project", "enterprise");

      expect(result.passed).toBe(true);
      expect(result.projectKey).toBe("my-project");
      expect(result.level).toBe("enterprise");
      expect(result.checks.length).toBe(9);
      expect(result.checks.every(c => c.passed)).toBe(true);
      expect(result.summary).toContain("All 9 enterprise quality checks passed");
    });

    test("validates project against enterprise thresholds - coverage failing", async () => {
      const mockResponse = {
        component: {
          key: "my-project",
          measures: [
            { metric: "coverage", value: "50.0" }, // Below 80%
            { metric: "duplicated_lines_density", value: "0" },
            { metric: "bugs", value: "0" },
            { metric: "vulnerabilities", value: "0" },
            { metric: "code_smells", value: "0" },
            { metric: "security_hotspots", value: "0" },
            { metric: "reliability_rating", value: "1" },
            { metric: "security_rating", value: "1" },
            { metric: "sqale_rating", value: "1" },
            { metric: "ncloc", value: "5000" },
          ],
        },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.validateEnterpriseQuality("my-project", "enterprise");

      expect(result.passed).toBe(false);
      expect(result.summary).toContain("1 of 9 enterprise quality checks failed");
      const coverageCheck = result.checks.find(c => c.name === "Coverage");
      expect(coverageCheck?.passed).toBe(false);
      expect(coverageCheck?.message).toContain("50.0%");
    });

    test("uses standard thresholds for standard level", async () => {
      // Standard thresholds: minCoverage: 70, maxDuplications: 3, maxCodeSmells: 10
      const mockResponse = {
        component: {
          key: "my-project",
          measures: [
            { metric: "coverage", value: "75.0" }, // Passes standard (70%)
            { metric: "duplicated_lines_density", value: "2.5" }, // Passes standard (3%)
            { metric: "bugs", value: "0" },
            { metric: "vulnerabilities", value: "0" },
            { metric: "code_smells", value: "5" }, // Passes standard (10)
            { metric: "security_hotspots", value: "0" },
            { metric: "reliability_rating", value: "2" }, // B rating passes standard
            { metric: "security_rating", value: "1" }, // A rating
            { metric: "sqale_rating", value: "2" }, // B rating passes standard
            { metric: "ncloc", value: "5000" },
          ],
        },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.validateEnterpriseQuality("my-project", "standard");

      expect(result.passed).toBe(true);
      expect(result.level).toBe("standard");
    });

    test("uses relaxed thresholds for relaxed level", async () => {
      // Relaxed thresholds: minCoverage: 50, maxDuplications: 5, maxBugs: 5, maxCodeSmells: 50, maxSecurityHotspots: 5
      // minReliabilityRating: 3 (C), minSecurityRating: 2 (B), minMaintainabilityRating: 3 (C)
      const mockResponse = {
        component: {
          key: "my-project",
          measures: [
            { metric: "coverage", value: "55.0" }, // Passes relaxed (50%)
            { metric: "duplicated_lines_density", value: "4.5" }, // Passes relaxed (5%)
            { metric: "bugs", value: "3" }, // Passes relaxed (5)
            { metric: "vulnerabilities", value: "0" },
            { metric: "code_smells", value: "40" }, // Passes relaxed (50)
            { metric: "security_hotspots", value: "3" }, // Passes relaxed (5)
            { metric: "reliability_rating", value: "3" }, // C rating passes relaxed
            { metric: "security_rating", value: "2" }, // B rating passes relaxed
            { metric: "sqale_rating", value: "3" }, // C rating passes relaxed
            { metric: "ncloc", value: "5000" },
          ],
        },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.validateEnterpriseQuality("my-project", "relaxed");

      expect(result.passed).toBe(true);
      expect(result.level).toBe("relaxed");
    });

    test("defaults to enterprise thresholds for off level", async () => {
      const mockResponse = {
        component: {
          key: "my-project",
          measures: [
            { metric: "coverage", value: "85.0" },
            { metric: "duplicated_lines_density", value: "0" },
            { metric: "bugs", value: "0" },
            { metric: "vulnerabilities", value: "0" },
            { metric: "code_smells", value: "0" },
            { metric: "security_hotspots", value: "0" },
            { metric: "reliability_rating", value: "1" },
            { metric: "security_rating", value: "1" },
            { metric: "sqale_rating", value: "1" },
            { metric: "ncloc", value: "5000" },
          ],
        },
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.validateEnterpriseQuality("my-project", "off");

      expect(result.level).toBe("off");
      // Should use enterprise thresholds by default
      expect(result.passed).toBe(true);
    });
  });

  describe("formatEnterpriseValidation", () => {
    test("formats passing validation result", () => {
      const result: EnterpriseValidationResult = {
        passed: true,
        projectKey: "my-project",
        level: "enterprise",
        summary: "All 9 enterprise quality checks passed",
        checks: [
          { name: "Coverage", passed: true, actual: "85.0%", expected: ">= 80%", message: "Coverage 85.0% meets threshold" },
          { name: "Bugs", passed: true, actual: 0, expected: "<= 0", message: "0 bugs meets threshold" },
        ],
        metrics: {
          coverage: 85.0,
          duplications: 0,
          bugs: 0,
          vulnerabilities: 0,
          codeSmells: 0,
          securityHotspots: 0,
          reliabilityRating: "A",
          securityRating: "A",
          maintainabilityRating: "A",
          linesOfCode: 5000,
        },
        timestamp: new Date().toISOString(),
      };

      const formatted = api.formatEnterpriseValidation(result);

      expect(formatted).toContain("[PASS]");
      expect(formatted).toContain("my-project");
      expect(formatted).toContain("enterprise");
      expect(formatted).toContain("Coverage");
      expect(formatted).toContain("85.0%");
      expect(formatted).not.toContain("Failed Checks");
    });

    test("formats failing validation result with failed checks section", () => {
      const result: EnterpriseValidationResult = {
        passed: false,
        projectKey: "my-project",
        level: "enterprise",
        summary: "2 of 9 enterprise quality checks failed",
        checks: [
          { name: "Coverage", passed: false, actual: "50.0%", expected: ">= 80%", message: "Coverage 50.0% is below 80% threshold" },
          { name: "Bugs", passed: false, actual: 5, expected: "<= 0", message: "5 bugs exceeds 0 threshold" },
          { name: "Vulnerabilities", passed: true, actual: 0, expected: "<= 0", message: "0 vulnerabilities meets threshold" },
        ],
        metrics: {
          coverage: 50.0,
          duplications: 0,
          bugs: 5,
          vulnerabilities: 0,
          codeSmells: 0,
          securityHotspots: 0,
          reliabilityRating: "A",
          securityRating: "A",
          maintainabilityRating: "A",
          linesOfCode: 5000,
        },
        timestamp: new Date().toISOString(),
      };

      const formatted = api.formatEnterpriseValidation(result);

      expect(formatted).toContain("[FAIL]");
      expect(formatted).toContain("Failed Checks");
      expect(formatted).toContain("Coverage");
      expect(formatted).toContain("50.0% is below 80% threshold");
      expect(formatted).toContain("Bugs");
      expect(formatted).toContain("5 bugs exceeds 0 threshold");
    });

    test("includes all metrics in output", () => {
      const result: EnterpriseValidationResult = {
        passed: true,
        projectKey: "test",
        level: "standard",
        summary: "All checks passed",
        checks: [],
        metrics: {
          coverage: 75.5,
          duplications: 2.3,
          bugs: 1,
          vulnerabilities: 2,
          codeSmells: 10,
          securityHotspots: 3,
          reliabilityRating: "B",
          securityRating: "A",
          maintainabilityRating: "C",
          linesOfCode: 12345,
        },
        timestamp: new Date().toISOString(),
      };

      const formatted = api.formatEnterpriseValidation(result);

      expect(formatted).toContain("75.5%");
      expect(formatted).toContain("2.3%");
      expect(formatted).toContain("| Bugs | 1 |");
      expect(formatted).toContain("| Vulnerabilities | 2 |");
      expect(formatted).toContain("| Code Smells | 10 |");
      expect(formatted).toContain("| Security Hotspots | 3 |");
      expect(formatted).toContain("| Reliability Rating | B |");
      expect(formatted).toContain("| Security Rating | A |");
      expect(formatted).toContain("| Maintainability Rating | C |");
      expect(formatted).toContain("12,345");
    });

    test("handles undefined coverage and duplications", () => {
      const result: EnterpriseValidationResult = {
        passed: true,
        projectKey: "test",
        level: "standard",
        summary: "All checks passed",
        checks: [],
        metrics: {
          coverage: undefined,
          duplications: undefined,
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
      };

      const formatted = api.formatEnterpriseValidation(result);

      expect(formatted).toContain("| Coverage | N/A% |");
      expect(formatted).toContain("| Duplications | N/A% |");
    });
  });
});
