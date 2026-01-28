/**
 * Tests for IssuesAPI
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { IssuesAPI } from "./issues.ts";
import { SonarQubeClient } from "./client.ts";
import type { SonarQubeIssue, IssuesSearchResponse } from "../types/index.ts";

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("IssuesAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let client: SonarQubeClient;
  let api: IssuesAPI;

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
    api = new IssuesAPI(client);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("search", () => {
    test("searches for issues with basic options", async () => {
      const mockResponse = {
        issues: [],
        components: [],
        paging: { pageIndex: 1, pageSize: 500, total: 0 },
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

      const result = await api.search({ projectKey: "my-project" });

      expect(result.issues).toEqual([]);
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("componentKeys=my-project");
    });

    test("includes all search parameters when provided", async () => {
      const mockResponse = {
        issues: [],
        components: [],
        paging: { pageIndex: 1, pageSize: 100, total: 0 },
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

      await api.search({
        projectKey: "my-project",
        severities: ["BLOCKER", "CRITICAL"],
        types: ["BUG", "VULNERABILITY"],
        statuses: ["OPEN", "CONFIRMED"],
        resolved: false,
        onBranch: "main",
        inNewCode: true,
        pageSize: 100,
        page: 2,
      });

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("severities=BLOCKER%2CCRITICAL");
      expect(callUrl).toContain("types=BUG%2CVULNERABILITY");
      expect(callUrl).toContain("statuses=OPEN%2CCONFIRMED");
      expect(callUrl).toContain("resolved=false");
      expect(callUrl).toContain("branch=main");
      expect(callUrl).toContain("inNewCodePeriod=true");
      expect(callUrl).toContain("ps=100");
      expect(callUrl).toContain("p=2");
    });
  });

  describe("getAll", () => {
    test("fetches all issues with pagination", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        const response = {
          issues: [{ key: `issue-${callCount}`, severity: "MAJOR" }],
          components: [],
          paging: { pageIndex: callCount, pageSize: 1, total: 2 },
        };
        return Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getAll({ projectKey: "my-project" });

      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("respects maxPages limit", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              issues: [{ key: "issue-1" }],
              components: [],
              paging: { pageIndex: 1, pageSize: 500, total: 10000 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getAll({ projectKey: "my-project", maxPages: 3 });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3);
    });
  });

  describe("getBySeverity", () => {
    test("filters by severity levels", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              issues: [{ key: "issue-1", severity: "BLOCKER" }],
              components: [],
              paging: { pageIndex: 1, pageSize: 500, total: 1 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.getBySeverity("my-project", ["BLOCKER", "CRITICAL"]);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("severities=BLOCKER%2CCRITICAL");
    });
  });

  describe("getCritical", () => {
    test("fetches only BLOCKER and CRITICAL issues", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              issues: [],
              components: [],
              paging: { pageIndex: 1, pageSize: 500, total: 0 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.getCritical("my-project");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("severities=BLOCKER%2CCRITICAL");
    });
  });

  describe("getSecurityIssues", () => {
    test("fetches VULNERABILITY type only (security hotspots have separate API)", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              issues: [],
              components: [],
              paging: { pageIndex: 1, pageSize: 500, total: 0 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.getSecurityIssues("my-project");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("types=VULNERABILITY");
      expect(callUrl).not.toContain("SECURITY_HOTSPOT");
    });
  });

  describe("getBugs", () => {
    test("fetches only BUG type issues", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              issues: [],
              components: [],
              paging: { pageIndex: 1, pageSize: 500, total: 0 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.getBugs("my-project");

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("types=BUG");
    });
  });

  describe("formatIssues", () => {
    test("formats issues with component paths", () => {
      const issues = [
        {
          key: "issue-1",
          severity: "MAJOR",
          type: "BUG",
          rule: "typescript:S123",
          message: "Fix this bug",
          component: "my-project:src/app.ts",
          line: 42,
          effort: "15min",
          quickFixAvailable: true,
        },
      ] as SonarQubeIssue[];
      const components = [
        { key: "my-project:src/app.ts", name: "app.ts", path: "src/app.ts" },
      ] as IssuesSearchResponse["components"];

      const result = api.formatIssues(issues, components);

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe("src/app.ts");
      expect(result[0].line).toBe(42);
      expect(result[0].message).toBe("Fix this bug");
      expect(result[0].quickFixAvailable).toBe(true);
    });

    test("uses longName when path is not available", () => {
      const issues = [
        {
          key: "issue-1",
          severity: "MAJOR",
          type: "BUG",
          rule: "typescript:S123",
          message: "Fix this",
          component: "my-project:src/utils/helper.ts",
        },
      ] as SonarQubeIssue[];
      const components = [
        { key: "my-project:src/utils/helper.ts", name: "helper.ts", longName: "src/utils/helper.ts" },
      ] as IssuesSearchResponse["components"];

      const result = api.formatIssues(issues, components);

      expect(result[0].file).toBe("src/utils/helper.ts");
    });

    test("uses component name when path and longName not available", () => {
      const issues = [
        {
          key: "issue-1",
          severity: "MAJOR",
          type: "BUG",
          rule: "typescript:S123",
          message: "Fix this",
          component: "my-project:src/app.ts",
        },
      ] as SonarQubeIssue[];
      const components = [
        { key: "my-project:src/app.ts", name: "app.ts" },
      ] as IssuesSearchResponse["components"];

      const result = api.formatIssues(issues, components);

      expect(result[0].file).toBe("app.ts");
    });

    test("extracts path from component key when not in components list", () => {
      const issues = [
        {
          key: "issue-1",
          severity: "MAJOR",
          type: "BUG",
          rule: "typescript:S123",
          message: "Fix this",
          component: "my-project:src/unknown.ts",
        },
      ] as SonarQubeIssue[];
      const components: IssuesSearchResponse["components"] = [];

      const result = api.formatIssues(issues, components);

      expect(result[0].file).toBe("src/unknown.ts");
    });

    test("uses textRange.startLine when line is not available", () => {
      const issues = [
        {
          key: "issue-1",
          severity: "MAJOR",
          type: "BUG",
          rule: "typescript:S123",
          message: "Fix this",
          component: "my-project:src/app.ts",
          textRange: { startLine: 100, endLine: 105, startOffset: 0, endOffset: 50 },
        },
      ] as SonarQubeIssue[];

      const result = api.formatIssues(issues, []);

      expect(result[0].line).toBe(100);
    });

    test("handles missing quickFixAvailable", () => {
      const issues = [
        {
          key: "issue-1",
          severity: "MAJOR",
          type: "BUG",
          rule: "typescript:S123",
          message: "Fix this",
          component: "my-project:src/app.ts",
        },
      ] as SonarQubeIssue[];

      const result = api.formatIssues(issues, []);

      expect(result[0].quickFixAvailable).toBe(false);
    });
  });

  describe("getFormattedIssues", () => {
    test("returns formatted issues", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              issues: [
                {
                  key: "issue-1",
                  severity: "MAJOR",
                  type: "BUG",
                  rule: "ts:S123",
                  message: "Bug here",
                  component: "proj:src/app.ts",
                  line: 10,
                },
              ],
              components: [{ key: "proj:src/app.ts", path: "src/app.ts" }],
              paging: { pageIndex: 1, pageSize: 500, total: 1 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getFormattedIssues({ projectKey: "proj" });

      expect(result).toHaveLength(1);
      expect(result[0].file).toBe("src/app.ts");
    });
  });

  describe("getCounts", () => {
    test("counts issues by severity", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              issues: [
                { key: "1", severity: "BLOCKER" },
                { key: "2", severity: "BLOCKER" },
                { key: "3", severity: "CRITICAL" },
                { key: "4", severity: "MAJOR" },
                { key: "5", severity: "MAJOR" },
                { key: "6", severity: "MAJOR" },
                { key: "7", severity: "MINOR" },
                { key: "8", severity: "INFO" },
              ],
              components: [],
              paging: { pageIndex: 1, pageSize: 500, total: 8 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getCounts("my-project");

      expect(result.total).toBe(8);
      expect(result.blocker).toBe(2);
      expect(result.critical).toBe(1);
      expect(result.major).toBe(3);
      expect(result.minor).toBe(1);
      expect(result.info).toBe(1);
    });
  });

  describe("getSecurityHotspots", () => {
    test("fetches security hotspots for project", async () => {
      const mockHotspots = {
        paging: { pageIndex: 1, pageSize: 500, total: 2 },
        hotspots: [
          {
            key: "hs-1",
            component: "my-project:src/auth.ts",
            project: "my-project",
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
            component: "my-project:src/crypto.ts",
            project: "my-project",
            securityCategory: "weak-cryptography",
            vulnerabilityProbability: "MEDIUM",
            status: "TO_REVIEW",
            line: 15,
            message: "Make sure this cryptographic algorithm is safe",
            creationDate: "2026-01-24T10:00:00Z",
            updateDate: "2026-01-24T10:00:00Z",
          },
        ],
        components: [],
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockHotspots), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getSecurityHotspots("my-project");

      expect(result).toHaveLength(2);
      expect(result[0].vulnerabilityProbability).toBe("HIGH");
      expect(result[0].status).toBe("TO_REVIEW");
      expect(result[1].securityCategory).toBe("weak-cryptography");
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("/api/hotspots/search");
      expect(callUrl).toContain("projectKey=my-project");
    });

    test("returns empty array when API fails", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ errors: [{ msg: "Not found" }] }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getSecurityHotspots("my-project");

      expect(result).toEqual([]);
    });

    test("returns empty array on network error", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getSecurityHotspots("my-project");

      expect(result).toEqual([]);
    });
  });

  describe("getSecurityHotspotsToReview", () => {
    test("filters hotspots to only TO_REVIEW status", async () => {
      const mockHotspots = {
        paging: { pageIndex: 1, pageSize: 500, total: 3 },
        hotspots: [
          {
            key: "hs-1",
            component: "my-project:src/auth.ts",
            project: "my-project",
            securityCategory: "sql-injection",
            vulnerabilityProbability: "HIGH",
            status: "TO_REVIEW",
            message: "Review this",
            creationDate: "2026-01-24T10:00:00Z",
            updateDate: "2026-01-24T10:00:00Z",
          },
          {
            key: "hs-2",
            component: "my-project:src/safe.ts",
            project: "my-project",
            securityCategory: "weak-cryptography",
            vulnerabilityProbability: "LOW",
            status: "REVIEWED",
            message: "Already reviewed",
            creationDate: "2026-01-24T10:00:00Z",
            updateDate: "2026-01-24T10:00:00Z",
          },
          {
            key: "hs-3",
            component: "my-project:src/fixed.ts",
            project: "my-project",
            securityCategory: "path-traversal",
            vulnerabilityProbability: "HIGH",
            status: "FIXED",
            message: "Fixed",
            creationDate: "2026-01-24T10:00:00Z",
            updateDate: "2026-01-24T10:00:00Z",
          },
        ],
        components: [],
      };
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockHotspots), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getSecurityHotspotsToReview("my-project");

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("hs-1");
      expect(result[0].status).toBe("TO_REVIEW");
    });
  });
});
