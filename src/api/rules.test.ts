/**
 * Tests for RulesAPI
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { RulesAPI } from "./rules.ts";
import { createTestClient } from "./test-utils.ts";

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("RulesAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let api: RulesAPI;

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
    api = new RulesAPI(createTestClient());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getRule", () => {
    test("fetches rule details by key", async () => {
      const mockResponse = {
        rules: [
          {
            key: "typescript:S1234",
            name: "Test Rule",
            mdDesc: "This is a test rule description",
            severity: "MAJOR",
            type: "CODE_SMELL",
            lang: "ts",
            langName: "TypeScript",
            tags: ["security", "best-practice"],
          },
        ],
        paging: { pageIndex: 1, pageSize: 1, total: 1 },
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

      const result = await api.getRule("typescript:S1234");

      expect(result).toBeDefined();
      expect(result?.key).toBe("typescript:S1234");
      expect(result?.name).toBe("Test Rule");
      expect(result?.severity).toBe("MAJOR");
      expect(result?.tags).toEqual(["security", "best-practice"]);
    });

    test("returns undefined for unknown rule", async () => {
      const mockResponse = {
        rules: [],
        paging: { pageIndex: 1, pageSize: 1, total: 0 },
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

      const result = await api.getRule("unknown:rule");

      expect(result).toBeUndefined();
    });

    test("caches rule details", async () => {
      const mockResponse = {
        rules: [
          {
            key: "typescript:S1234",
            name: "Test Rule",
            severity: "MAJOR",
            type: "CODE_SMELL",
          },
        ],
        paging: { pageIndex: 1, pageSize: 1, total: 1 },
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

      // First call
      await api.getRule("typescript:S1234");
      // Second call should use cache
      await api.getRule("typescript:S1234");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("handles API errors gracefully", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getRule("typescript:S1234");

      expect(result).toBeUndefined();
    });

    test("extracts description from descriptionSections (v26+ format)", async () => {
      const mockResponse = {
        rules: [
          {
            key: "typescript:S7778",
            name: "Combine push calls",
            htmlDesc: null,
            mdDesc: null,
            descriptionSections: [
              {
                key: "introduction",
                content: "<p>This rule raises an issue when multiple push calls are made.</p>",
              },
              {
                key: "root_cause",
                content: "<p>Root cause description with more details.</p>",
              },
            ],
            severity: "MINOR",
            type: "CODE_SMELL",
            lang: "ts",
            langName: "TypeScript",
            tags: [],
            sysTags: ["readability", "performance"],
          },
        ],
        paging: { pageIndex: 1, pageSize: 1, total: 1 },
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

      const result = await api.getRule("typescript:S7778");

      expect(result).toBeDefined();
      expect(result?.key).toBe("typescript:S7778");
      expect(result?.description).toContain("This rule raises an issue");
      // Should merge sysTags with tags
      expect(result?.tags).toContain("readability");
      expect(result?.tags).toContain("performance");
    });

    test("falls back to root_cause if no introduction section", async () => {
      const mockResponse = {
        rules: [
          {
            key: "typescript:S1234",
            name: "Some Rule",
            descriptionSections: [
              {
                key: "root_cause",
                content: "<p>Root cause explanation only.</p>",
              },
            ],
            severity: "MAJOR",
            type: "BUG",
          },
        ],
        paging: { pageIndex: 1, pageSize: 1, total: 1 },
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

      const result = await api.getRule("typescript:S1234");

      expect(result).toBeDefined();
      expect(result?.description).toContain("Root cause explanation only");
    });
  });

  describe("getRules", () => {
    test("fetches multiple rules", async () => {
      const mockResponse = {
        rules: [
          {
            key: "typescript:S1234",
            name: "Rule 1",
            severity: "MAJOR",
            type: "BUG",
          },
          {
            key: "typescript:S5678",
            name: "Rule 2",
            severity: "CRITICAL",
            type: "VULNERABILITY",
          },
        ],
        paging: { pageIndex: 1, pageSize: 500, total: 2 },
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

      const result = await api.getRules(["typescript:S1234", "typescript:S5678"]);

      expect(result.size).toBe(2);
      expect(result.get("typescript:S1234")?.name).toBe("Rule 1");
      expect(result.get("typescript:S5678")?.name).toBe("Rule 2");
    });

    test("uses cache for already fetched rules", async () => {
      const mockResponse = {
        rules: [
          {
            key: "typescript:S1234",
            name: "Rule 1",
            severity: "MAJOR",
            type: "BUG",
          },
        ],
        paging: { pageIndex: 1, pageSize: 500, total: 1 },
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

      // First fetch
      await api.getRule("typescript:S1234");
      
      // Reset mock to track second call
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ rules: [], paging: {} }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      // Second fetch should only request uncached rules
      const result = await api.getRules(["typescript:S1234", "typescript:S9999"]);

      expect(result.get("typescript:S1234")?.name).toBe("Rule 1");
      // S9999 wasn't in response, but S1234 should be from cache
    });

    test("handles descriptionSections in batch fetch (v26+ format)", async () => {
      const mockResponse = {
        rules: [
          {
            key: "typescript:S1234",
            name: "Rule with sections",
            descriptionSections: [
              { key: "introduction", content: "<p>Introduction text.</p>" },
            ],
            severity: "MAJOR",
            type: "CODE_SMELL",
            sysTags: ["maintainability"],
          },
        ],
        paging: { pageIndex: 1, pageSize: 500, total: 1 },
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

      const result = await api.getRules(["typescript:S1234"]);

      expect(result.size).toBe(1);
      const rule = result.get("typescript:S1234");
      expect(rule?.description).toContain("Introduction text");
      expect(rule?.tags).toContain("maintainability");
    });
  });

  describe("formatRuleForAgent", () => {
    test("formats rule with all details", () => {
      const rule = {
        key: "typescript:S1234",
        name: "Avoid SQL Injection",
        description: "SQL injection vulnerabilities can allow attackers to execute arbitrary SQL.",
        severity: "BLOCKER",
        type: "VULNERABILITY",
        lang: "ts",
        langName: "TypeScript",
        tags: ["security", "sql", "injection"],
      };

      const result = api.formatRuleForAgent(rule);

      expect(result).toContain("### Rule: Avoid SQL Injection");
      expect(result).toContain("`typescript:S1234`");
      expect(result).toContain("BLOCKER");
      expect(result).toContain("VULNERABILITY");
      expect(result).toContain("security, sql, injection");
      expect(result).toContain("SQL injection vulnerabilities");
    });

    test("formats rule without tags", () => {
      const rule = {
        key: "typescript:S1234",
        name: "Test Rule",
        description: "Test description",
        severity: "MAJOR",
        type: "CODE_SMELL",
        tags: [],
      };

      const result = api.formatRuleForAgent(rule);

      expect(result).toContain("### Rule: Test Rule");
      expect(result).not.toContain("**Tags:**");
    });
  });
});
