/**
 * Tests for MetricsAPI
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { MetricsAPI, COMMON_METRICS } from "./metrics.ts";
import { SonarQubeClient } from "./client.ts";

const originalFetch = globalThis.fetch;

describe("MetricsAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let client: SonarQubeClient;
  let api: MetricsAPI;

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
    api = new MetricsAPI(client);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getMetricDefinitions", () => {
    test("fetches metric definitions", async () => {
      const mockResponse = {
        metrics: [
          { key: "ncloc", name: "Lines of Code", type: "INT" },
          { key: "coverage", name: "Coverage", type: "PERCENT" },
        ],
        total: 2,
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

      const result = await api.getMetricDefinitions();

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe("ncloc");
    });

    test("handles API errors", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getMetricDefinitions();

      expect(result).toEqual([]);
    });
  });

  describe("getMeasures", () => {
    test("fetches measures for component", async () => {
      const mockResponse = {
        component: {
          key: "test-project",
          name: "Test Project",
          qualifier: "TRK",
          measures: [
            { metric: "ncloc", value: "1000" },
            { metric: "coverage", value: "85.5" },
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

      const result = await api.getMeasures({ componentKey: "test-project" });

      expect(result).toHaveLength(2);
      expect(result[0].metric).toBe("ncloc");
      expect(result[0].value).toBe("1000");
    });

    test("handles API errors", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getMeasures({ componentKey: "test-project" });

      expect(result).toEqual([]);
    });
  });

  describe("getMeasuresWithPeriod", () => {
    test("fetches measures with period data", async () => {
      const mockResponse = {
        component: {
          key: "test-project",
          name: "Test Project",
          qualifier: "TRK",
          measures: [
            { metric: "ncloc", value: "1000", period: { value: "100" } },
            { metric: "coverage", value: "85.5", period: { value: "90.0" } },
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

      const result = await api.getMeasuresWithPeriod({ componentKey: "test-project" });

      expect(result).toHaveLength(2);
      expect(result[0].period?.value).toBe("100");
    });
  });

  describe("formatMeasuresForAgent", () => {
    test("formats measures by category", () => {
      const measures = [
        { metric: "ncloc", value: "1000" },
        { metric: "coverage", value: "85.5", period: { value: "90.0" } },
        { metric: "reliability_rating", value: "1" },
        { metric: "sqale_index", value: "120" },
        { metric: "duplicated_lines_density", value: "2.5" },
      ];

      const result = api.formatMeasuresForAgent(measures);

      expect(result).toContain("## Code Metrics");
      expect(result).toContain("📏 Size");
      expect(result).toContain("Lines of Code:** 1000");
      expect(result).toContain("📊 Coverage");
      expect(result).toContain("Coverage:** 85.5%");
      expect(result).toContain("(new code: 90.0%)");
      expect(result).toContain("⭐ Ratings");
      expect(result).toContain("Reliability:** A");
      expect(result).toContain("⏱️ Technical Debt");
      expect(result).toContain("Technical Debt:** 2h 0min");
      expect(result).toContain("📋 Duplications");
      expect(result).toContain("Duplication:** 2.5%");
    });

    test("returns message for empty measures", () => {
      const result = api.formatMeasuresForAgent([]);

      expect(result).toBe("No metrics available.");
    });

    test("formats technical debt in days", () => {
      const measures = [{ metric: "sqale_index", value: "2880" }]; // 2 days

      const result = api.formatMeasuresForAgent(measures);

      expect(result).toContain("2d");
    });
  });

  describe("COMMON_METRICS", () => {
    test("exports common metrics array", () => {
      expect(COMMON_METRICS).toContain("ncloc");
      expect(COMMON_METRICS).toContain("coverage");
      expect(COMMON_METRICS).toContain("bugs");
      expect(COMMON_METRICS).toContain("reliability_rating");
    });
  });
});
