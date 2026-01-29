/**
 * Tests for SonarQube Duplications API
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { DuplicationsAPI, type FormattedDuplication } from "./duplications.ts";
import { createTestClient } from "./test-utils.ts";

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("DuplicationsAPI", () => {
  let mockFetch: ReturnType<typeof mock>;
  let api: DuplicationsAPI;

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
    api = new DuplicationsAPI(createTestClient());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getDuplications", () => {
    test("fetches duplications for a component", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              duplications: [
                {
                  blocks: [
                    { from: 10, size: 5, _ref: "1" },
                    { from: 50, size: 5, _ref: "2" },
                  ],
                },
              ],
              files: {
                "1": { key: "proj:src/a.ts", name: "a.ts" },
                "2": { key: "proj:src/b.ts", name: "b.ts" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getDuplications("proj:src/a.ts");

      expect(result).toHaveLength(1);
      expect(result[0].originalFile).toBe("src/a.ts");
      expect(result[0].originalLines).toEqual({ from: 10, to: 14 });
      expect(result[0].duplicateFile).toBe("src/b.ts");
      expect(result[0].duplicateLines).toEqual({ from: 50, to: 54 });
      expect(result[0].lineCount).toBe(5);
    });

    test("handles multiple duplicated blocks", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              duplications: [
                {
                  blocks: [
                    { from: 10, size: 5, _ref: "1" },
                    { from: 50, size: 5, _ref: "2" },
                    { from: 100, size: 5, _ref: "3" },
                  ],
                },
              ],
              files: {
                "1": { key: "proj:src/a.ts", name: "a.ts" },
                "2": { key: "proj:src/b.ts", name: "b.ts" },
                "3": { key: "proj:src/c.ts", name: "c.ts" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getDuplications("proj:src/a.ts");

      expect(result).toHaveLength(2);
      expect(result[0].duplicateFile).toBe("src/b.ts");
      expect(result[1].duplicateFile).toBe("src/c.ts");
    });

    test("handles same-file duplications", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              duplications: [
                {
                  blocks: [
                    { from: 10, size: 5, _ref: "1" },
                    { from: 50, size: 5, _ref: "1" },
                  ],
                },
              ],
              files: {
                "1": { key: "proj:src/a.ts", name: "a.ts" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getDuplications("proj:src/a.ts");

      expect(result).toHaveLength(1);
      expect(result[0].originalFile).toBe("src/a.ts");
      expect(result[0].duplicateFile).toBe("src/a.ts");
    });

    test("returns empty array when no duplications", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              duplications: [],
              files: {},
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getDuplications("proj:src/a.ts");

      expect(result).toEqual([]);
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

      const result = await api.getDuplications("proj:nonexistent.ts");

      expect(result).toEqual([]);
    });

    test("returns empty array on network error", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getDuplications("proj:src/a.ts");

      expect(result).toEqual([]);
    });

    test("skips blocks with less than 2 entries", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              duplications: [
                {
                  blocks: [{ from: 10, size: 5, _ref: "1" }],
                },
              ],
              files: {
                "1": { key: "proj:src/a.ts", name: "a.ts" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getDuplications("proj:src/a.ts");

      expect(result).toEqual([]);
    });

    test("skips blocks with missing file info", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              duplications: [
                {
                  blocks: [
                    { from: 10, size: 5, _ref: "1" },
                    { from: 50, size: 5, _ref: "999" }, // Missing ref
                  ],
                },
              ],
              files: {
                "1": { key: "proj:src/a.ts", name: "a.ts" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getDuplications("proj:src/a.ts");

      expect(result).toEqual([]);
    });
  });

  describe("getProjectDuplications", () => {
    test("fetches duplications for project components", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          // First call: component_tree
          return Promise.resolve(
            new Response(
              JSON.stringify({
                components: [
                  {
                    key: "proj:src/a.ts",
                    measures: [{ metric: "duplicated_lines_density", value: "10.5" }],
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        // Second call: duplications/show
        return Promise.resolve(
          new Response(
            JSON.stringify({
              duplications: [
                {
                  blocks: [
                    { from: 10, size: 5, _ref: "1" },
                    { from: 50, size: 5, _ref: "2" },
                  ],
                },
              ],
              files: {
                "1": { key: "proj:src/a.ts", name: "a.ts" },
                "2": { key: "proj:src/b.ts", name: "b.ts" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getProjectDuplications("my-project");

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("filters out components without duplications", async () => {
      mockFetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              components: [
                {
                  key: "proj:src/a.ts",
                  measures: [{ metric: "duplicated_lines_density", value: "0" }],
                },
                {
                  key: "proj:src/b.ts",
                  measures: [{ metric: "duplicated_lines_density", value: "5.5" }],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      // Call will make 1 request for component tree and 1 for the single duplicated component
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                components: [
                  {
                    key: "proj:src/a.ts",
                    measures: [{ metric: "duplicated_lines_density", value: "0" }],
                  },
                  {
                    key: "proj:src/b.ts",
                    measures: [{ metric: "duplicated_lines_density", value: "5.5" }],
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ duplications: [], files: {} }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.getProjectDuplications("my-project");

      // Only 2 calls: component tree + one duplicated component
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("respects limit parameter", async () => {
      let callCount = 0;
      mockFetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                components: Array.from({ length: 50 }, (_, i) => ({
                  key: `proj:src/file${i}.ts`,
                  measures: [{ metric: "duplicated_lines_density", value: "5" }],
                })),
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ duplications: [], files: {} }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await api.getProjectDuplications("my-project", 5);

      // 1 component tree call + 5 duplication calls (limited)
      expect(mockFetch).toHaveBeenCalledTimes(6);
    });

    test("returns empty array on error", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getProjectDuplications("my-project");

      expect(result).toEqual([]);
    });
  });

  describe("formatForAgent", () => {
    test("formats duplications for agent display", () => {
      const duplications: FormattedDuplication[] = [
        {
          originalFile: "src/a.ts",
          originalLines: { from: 10, to: 19 },
          duplicateFile: "src/b.ts",
          duplicateLines: { from: 50, to: 59 },
          lineCount: 10,
        },
      ];

      const result = api.formatForAgent(duplications);

      expect(result).toContain("## Code Duplications Found: 1");
      expect(result).toContain("### `src/a.ts`");
      expect(result).toContain("Lines 10-19 duplicated in `src/b.ts` lines 50-59 (10 lines)");
      expect(result).toContain("**Recommendation:**");
    });

    test("formats same-file duplications differently", () => {
      const duplications: FormattedDuplication[] = [
        {
          originalFile: "src/a.ts",
          originalLines: { from: 10, to: 19 },
          duplicateFile: "src/a.ts",
          duplicateLines: { from: 50, to: 59 },
          lineCount: 10,
        },
      ];

      const result = api.formatForAgent(duplications);

      expect(result).toContain("Lines 10-19 duplicated at lines 50-59");
      expect(result).not.toContain("duplicated in `src/a.ts`");
    });

    test("groups duplications by original file", () => {
      const duplications: FormattedDuplication[] = [
        {
          originalFile: "src/a.ts",
          originalLines: { from: 10, to: 19 },
          duplicateFile: "src/b.ts",
          duplicateLines: { from: 50, to: 59 },
          lineCount: 10,
        },
        {
          originalFile: "src/a.ts",
          originalLines: { from: 100, to: 109 },
          duplicateFile: "src/c.ts",
          duplicateLines: { from: 200, to: 209 },
          lineCount: 10,
        },
        {
          originalFile: "src/d.ts",
          originalLines: { from: 1, to: 5 },
          duplicateFile: "src/e.ts",
          duplicateLines: { from: 10, to: 14 },
          lineCount: 5,
        },
      ];

      const result = api.formatForAgent(duplications);

      // Check that files are grouped
      expect(result).toContain("### `src/a.ts`");
      expect(result).toContain("### `src/d.ts`");
      
      // a.ts should have two entries under it
      const aSection = result.split("### `src/d.ts`")[0];
      expect(aSection.match(/Lines \d+-\d+/g)).toHaveLength(2);
    });

    test("returns message when no duplications", () => {
      const result = api.formatForAgent([]);

      expect(result).toBe("No code duplications found.");
    });
  });
});
