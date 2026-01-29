/**
 * Tests for BranchesAPI
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { BranchesAPI } from "./branches.ts";
import { createTestClient } from "./test-utils.ts";

const originalFetch = globalThis.fetch;

describe("BranchesAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let api: BranchesAPI;

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
    api = new BranchesAPI(createTestClient());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getBranches", () => {
    test("fetches branches for project", async () => {
      const mockResponse = {
        branches: [
          {
            name: "main",
            isMain: true,
            type: "BRANCH",
            status: { qualityGateStatus: "OK", bugs: 0, vulnerabilities: 0, codeSmells: 5 },
            analysisDate: "2026-01-24T10:00:00+0000",
          },
          {
            name: "feature-1",
            isMain: false,
            type: "BRANCH",
            status: { qualityGateStatus: "ERROR", bugs: 2, vulnerabilities: 1, codeSmells: 10 },
            analysisDate: "2026-01-23T10:00:00+0000",
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

      const result = await api.getBranches("test-project");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("main");
      expect(result[0].isMain).toBe(true);
    });

    test("handles API errors", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getBranches("test-project");

      expect(result).toEqual([]);
    });
  });

  describe("getMainBranch", () => {
    test("returns the main branch", async () => {
      const mockResponse = {
        branches: [
          { name: "feature", isMain: false, type: "BRANCH" },
          { name: "main", isMain: true, type: "BRANCH" },
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

      const result = await api.getMainBranch("test-project");

      expect(result?.name).toBe("main");
      expect(result?.isMain).toBe(true);
    });
  });

  describe("getBranch", () => {
    test("returns branch by name", async () => {
      const mockResponse = {
        branches: [
          { name: "main", isMain: true, type: "BRANCH" },
          { name: "feature-1", isMain: false, type: "BRANCH" },
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

      const result = await api.getBranch("test-project", "feature-1");

      expect(result?.name).toBe("feature-1");
    });
  });

  describe("deleteBranch", () => {
    test("deletes branch successfully", async () => {
      mockFetch = mock(() =>
        Promise.resolve(new Response("", { status: 204 }))
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.deleteBranch("test-project", "feature-1");

      expect(result).toBe(true);
    });

    test("handles deletion failure", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Forbidden")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.deleteBranch("test-project", "main");

      expect(result).toBe(false);
    });
  });

  describe("renameMainBranch", () => {
    test("renames main branch successfully", async () => {
      mockFetch = mock(() =>
        Promise.resolve(new Response("", { status: 204 }))
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.renameMainBranch("test-project", "new-name");

      expect(result).toBe(true);
    });

    test("handles rename failure", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Conflict")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.renameMainBranch("test-project", "master");

      expect(result).toBe(false);
    });
  });

  describe("formatBranchesForAgent", () => {
    test("formats branches with status", () => {
      const branches = [
        {
          name: "main",
          isMain: true,
          type: "BRANCH" as const,
          status: { qualityGateStatus: "OK" as const, bugs: 0, vulnerabilities: 0, codeSmells: 5 },
          analysisDate: "2026-01-24T10:00:00+0000",
        },
        {
          name: "feature-1",
          isMain: false,
          type: "BRANCH" as const,
          status: { qualityGateStatus: "ERROR" as const, bugs: 2, vulnerabilities: 1 },
        },
      ];

      const result = api.formatBranchesForAgent(branches);

      expect(result).toContain("## Project Branches");
      expect(result).toContain("### main ⭐ Main");
      expect(result).toContain("✅ OK");
      expect(result).toContain("5 code smells");
      expect(result).toContain("### feature-1");
      expect(result).toContain("❌ ERROR");
      expect(result).toContain("2 bugs");
    });

    test("returns message for empty branches", () => {
      const result = api.formatBranchesForAgent([]);

      expect(result).toContain("No branches found");
    });
  });
});
