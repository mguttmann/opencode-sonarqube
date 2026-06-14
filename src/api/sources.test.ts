/**
 * Tests for SonarQube Sources API
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { SourcesAPI, type IssueWithContext } from "./sources.ts";
import { createTestClient } from "./test-utils.ts";

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("SourcesAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let api: SourcesAPI;

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
    api = new SourcesAPI(createTestClient());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getSourceLines", () => {
    test("fetches source lines for a component", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              sources: [
                [1, "function test() {"],
                [2, "  return true;"],
                [3, "}"],
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getSourceLines("proj:src/test.ts");

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ line: 1, code: "function test() {" });
      expect(result[1]).toEqual({ line: 2, code: "  return true;" });
      expect(result[2]).toEqual({ line: 3, code: "}" });
    });

    test("fetches source lines with from/to range", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              sources: [
                [10, "// Line 10"],
                [11, "// Line 11"],
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getSourceLines("proj:src/test.ts", 10, 11);

      expect(result).toHaveLength(2);
      expect(result[0].line).toBe(10);
      expect(result[1].line).toBe(11);

      // Check that from/to params are passed
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("from=10");
      expect(url).toContain("to=11");
    });

    test("strips HTML tags from source code", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              sources: [
                [1, '<span class="k">function</span> test() {'],
                [2, '  <span class="s">"hello"</span>'],
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getSourceLines("proj:src/test.ts");

      expect(result[0].code).toBe("function test() {");
      expect(result[1].code).toBe('  "hello"');
    });

    test("returns empty array on error", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ errors: [{ msg: "Component not found" }] }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getSourceLines("proj:nonexistent.ts");

      expect(result).toEqual([]);
    });

    test("returns empty array on network error", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getSourceLines("proj:src/test.ts");

      expect(result).toEqual([]);
    });
  });

  describe("getContextAroundLine", () => {
    test("gets context around a specific line", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              sources: [
                [5, "// Line 5"],
                [6, "// Line 6"],
                [7, "// Line 7 - issue here"],
                [8, "// Line 8"],
                [9, "// Line 9"],
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getContextAroundLine("proj:src/test.ts", 7, 2);

      expect(result.component).toBe("proj:src/test.ts");
      expect(result.startLine).toBe(5);
      expect(result.endLine).toBe(9);
      expect(result.lines).toHaveLength(5);
    });

    test("handles line 1 without going negative", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              sources: [
                [1, "// Line 1"],
                [2, "// Line 2"],
                [3, "// Line 3"],
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getContextAroundLine("proj:src/test.ts", 1, 2);

      expect(result.startLine).toBe(1);
      expect(result.endLine).toBe(3);
    });

    test("uses default context of 5 lines", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ sources: [] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getContextAroundLine("proj:src/test.ts", 10);

      expect(result.startLine).toBe(5);
      expect(result.endLine).toBe(15);
    });
  });

  describe("getIssuesWithContext", () => {
    test("fetches context for multiple issues", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              sources: [
                [8, "// Line 8"],
                [9, "// Line 9"],
                [10, "// Line 10 - issue"],
                [11, "// Line 11"],
                [12, "// Line 12"],
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const issues = [
        {
          key: "issue-1",
          rule: "typescript:S1234",
          severity: "CRITICAL",
          message: "Bug found",
          component: "proj:src/test.ts",
          line: 10,
        },
      ];

      const result = await api.getIssuesWithContext(issues, 2);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("issue-1");
      expect(result[0].sourceContext).toBeDefined();
      expect(result[0].sourceContext!.lines).toHaveLength(5);
    });

    test("groups issues by component to minimize API calls", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              sources: [
                [1, "// Line 1"],
                [2, "// Line 2"],
                [3, "// Line 3"],
                [4, "// Line 4"],
                [5, "// Line 5"],
                [6, "// Line 6"],
                [7, "// Line 7"],
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const issues = [
        { key: "1", rule: "r1", severity: "MAJOR", message: "m1", component: "proj:src/a.ts", line: 2 },
        { key: "2", rule: "r2", severity: "MAJOR", message: "m2", component: "proj:src/a.ts", line: 5 },
      ];

      await api.getIssuesWithContext(issues, 1);

      // Should make only one call for the same component
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("handles issues without line numbers", async () => {
      const issues = [
        { key: "1", rule: "r1", severity: "MAJOR", message: "m1", component: "proj:src/a.ts" },
      ];

      const result = await api.getIssuesWithContext(issues);

      expect(result).toHaveLength(1);
      expect(result[0].sourceContext).toBeUndefined();
    });

    test("handles mixed issues with and without lines", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              sources: [[10, "// Line 10"]],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const issues = [
        { key: "1", rule: "r1", severity: "MAJOR", message: "m1", component: "proj:src/a.ts", line: 10 },
        { key: "2", rule: "r2", severity: "MAJOR", message: "m2", component: "proj:src/a.ts" },
      ];

      const result = await api.getIssuesWithContext(issues, 0);

      expect(result).toHaveLength(2);
      expect(result[0].sourceContext).toBeDefined();
      expect(result[1].sourceContext).toBeUndefined();
    });

    test("returns issues with empty context on API error", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const issues = [
        { key: "1", rule: "r1", severity: "MAJOR", message: "m1", component: "proj:src/a.ts", line: 10 },
      ];

      const result = await api.getIssuesWithContext(issues);

      expect(result).toHaveLength(1);
      // Note: getSourceLines catches errors and returns empty array,
      // so context is created but with empty lines
      expect(result[0].sourceContext).toBeDefined();
      expect(result[0].sourceContext!.lines).toEqual([]);
    });

    test("handles multiple components", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              sources: [[5, `// Component ${callCount}`]],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const issues = [
        { key: "1", rule: "r1", severity: "MAJOR", message: "m1", component: "proj:src/a.ts", line: 5 },
        { key: "2", rule: "r2", severity: "MAJOR", message: "m2", component: "proj:src/b.ts", line: 5 },
      ];

      const result = await api.getIssuesWithContext(issues, 0);

      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("formatIssueWithContext", () => {
    test("formats issue with source context", () => {
      const issue: IssueWithContext = {
        key: "issue-1",
        rule: "typescript:S1234",
        severity: "CRITICAL",
        message: "Potential null pointer",
        component: "proj:src/app.ts",
        line: 10,
        sourceContext: {
          component: "proj:src/app.ts",
          startLine: 8,
          endLine: 12,
          lines: [
            { line: 8, code: "function test() {" },
            { line: 9, code: "  const x = null;" },
            { line: 10, code: "  return x.value;" },
            { line: 11, code: "}" },
          ],
        },
      };

      const result = api.formatIssueWithContext(issue);

      expect(result).toContain("### CRITICAL: Potential null pointer");
      expect(result).toContain("**File:** `src/app.ts`:10");
      expect(result).toContain("**Rule:** `typescript:S1234`");
      expect(result).toContain("```");
      expect(result).toContain(">  10 |   return x.value;");
      expect(result).toContain("    9 |   const x = null;");
    });

    test("formats issue without source context", () => {
      const issue: IssueWithContext = {
        key: "issue-1",
        rule: "typescript:S1234",
        severity: "MAJOR",
        message: "Code smell",
        component: "proj:src/app.ts",
        line: 5,
        sourceContext: undefined,
      };

      const result = api.formatIssueWithContext(issue);

      expect(result).toContain("### MAJOR: Code smell");
      expect(result).toContain("**File:** `src/app.ts`:5");
      expect(result).not.toContain("```");
    });

    test("formats issue without line number", () => {
      const issue: IssueWithContext = {
        key: "issue-1",
        rule: "typescript:S1234",
        severity: "MINOR",
        message: "File-level issue",
        component: "proj:src/app.ts",
        sourceContext: undefined,
      };

      const result = api.formatIssueWithContext(issue);

      expect(result).toContain("**File:** `src/app.ts`");
      expect(result).not.toContain(":undefined");
    });

    test("formats issue with empty source context", () => {
      const issue: IssueWithContext = {
        key: "issue-1",
        rule: "typescript:S1234",
        severity: "INFO",
        message: "Info message",
        component: "proj:src/app.ts",
        line: 10,
        sourceContext: {
          component: "proj:src/app.ts",
          startLine: 8,
          endLine: 12,
          lines: [],
        },
      };

      const result = api.formatIssueWithContext(issue);

      expect(result).not.toContain("```");
    });

    test("handles component without project prefix", () => {
      const issue: IssueWithContext = {
        key: "issue-1",
        rule: "typescript:S1234",
        severity: "MAJOR",
        message: "Test",
        component: "src/app.ts",
        line: 10,
      };

      const result = api.formatIssueWithContext(issue);

      expect(result).toContain("**File:** `src/app.ts`:10");
    });
  });
});
