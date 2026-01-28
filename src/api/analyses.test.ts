/**
 * Tests for ProjectAnalysesAPI
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { ProjectAnalysesAPI } from "./analyses.ts";
import { SonarQubeClient } from "./client.ts";

const originalFetch = globalThis.fetch;

describe("ProjectAnalysesAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let client: SonarQubeClient;
  let api: ProjectAnalysesAPI;

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
    api = new ProjectAnalysesAPI(client);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getAnalyses", () => {
    test("fetches analysis history", async () => {
      const mockResponse = {
        paging: { pageIndex: 1, pageSize: 10, total: 2 },
        analyses: [
          {
            key: "analysis-1",
            date: "2026-01-24T10:00:00+0000",
            projectVersion: "1.0.0",
            events: [{ key: "e1", category: "VERSION", name: "1.0.0" }],
          },
          {
            key: "analysis-2",
            date: "2026-01-23T10:00:00+0000",
            events: [],
          },
        ],
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

      const result = await api.getAnalyses({ projectKey: "test-project" });

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe("analysis-1");
      expect(result[0].projectVersion).toBe("1.0.0");
    });

    test("handles API errors", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getAnalyses({ projectKey: "test-project" });

      expect(result).toEqual([]);
    });
  });

  describe("getLatestAnalysis", () => {
    test("returns the first analysis", async () => {
      const mockResponse = {
        paging: { pageIndex: 1, pageSize: 1, total: 5 },
        analyses: [
          {
            key: "latest",
            date: "2026-01-24T10:00:00+0000",
            events: [],
          },
        ],
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

      const result = await api.getLatestAnalysis("test-project");

      expect(result?.key).toBe("latest");
    });

    test("returns undefined when no analyses", async () => {
      const mockResponse = {
        paging: { pageIndex: 1, pageSize: 1, total: 0 },
        analyses: [],
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

      const result = await api.getLatestAnalysis("test-project");

      expect(result).toBeUndefined();
    });
  });

  describe("formatAnalysesForAgent", () => {
    test("formats analyses with events", () => {
      const analyses = [
        {
          key: "a1",
          date: "2026-01-24T10:00:00+0000",
          projectVersion: "1.0.0",
          revision: "abc123def456",
          events: [
            { key: "e1", category: "VERSION", name: "1.0.0" },
            { key: "e2", category: "QUALITY_GATE", name: "Passed" },
          ],
        },
      ];

      const result = api.formatAnalysesForAgent(analyses);

      expect(result).toContain("## Analysis History");
      expect(result).toContain("v1.0.0");
      expect(result).toContain("abc123de");
      expect(result).toContain("🏷️ 1.0.0");
      expect(result).toContain("🚦 Passed");
    });

    test("returns message for empty analyses", () => {
      const result = api.formatAnalysesForAgent([]);

      expect(result).toBe("No analysis history found.");
    });
  });
});
