import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { ComponentsAPI } from "./components.ts";
import { createTestClient } from "./test-utils.ts";

describe("ComponentsAPI", () => {
  let api: ComponentsAPI;
  let mockFetch: ReturnType<typeof mock>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    api = new ComponentsAPI(createTestClient("http://localhost:9000"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getTree", () => {
    test("fetches component tree with measures", async () => {
      const mockResponse = {
        paging: { pageIndex: 1, pageSize: 100, total: 2 },
        baseComponent: { key: "test-project", name: "Test", qualifier: "TRK" },
        components: [
          {
            key: "test-project:src/index.ts",
            name: "index.ts",
            qualifier: "FIL",
            path: "src/index.ts",
            language: "ts",
            measures: [
              { metric: "bugs", value: "3" },
              { metric: "vulnerabilities", value: "1" },
              { metric: "code_smells", value: "10" },
            ],
          },
        ],
      };

      mockFetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse)))
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getTree({ componentKey: "test-project" });

      expect(result.components).toHaveLength(1);
      expect(result.components[0].measures).toHaveLength(3);
    });
  });

  describe("getWorstFiles", () => {
    test("returns files sorted by total issues", async () => {
      const mockResponse = {
        paging: { pageIndex: 1, pageSize: 20, total: 2 },
        baseComponent: { key: "test-project", name: "Test", qualifier: "TRK" },
        components: [
          {
            key: "test-project:src/bad.ts",
            name: "bad.ts",
            qualifier: "FIL",
            path: "src/bad.ts",
            measures: [
              { metric: "bugs", value: "5" },
              { metric: "vulnerabilities", value: "2" },
              { metric: "code_smells", value: "20" },
              { metric: "security_hotspots", value: "1" },
            ],
          },
          {
            key: "test-project:src/ok.ts",
            name: "ok.ts",
            qualifier: "FIL",
            path: "src/ok.ts",
            measures: [
              { metric: "bugs", value: "0" },
              { metric: "vulnerabilities", value: "0" },
              { metric: "code_smells", value: "3" },
              { metric: "security_hotspots", value: "0" },
            ],
          },
        ],
      };

      mockFetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse)))
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getWorstFiles("test-project");

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe("src/bad.ts");
      expect(result[0].bugs).toBe(5);
      expect(result[0].total).toBe(28);
      expect(result[1].path).toBe("src/ok.ts");
      expect(result[1].total).toBe(3);
    });

    test("filters out files with no issues", async () => {
      const mockResponse = {
        paging: { pageIndex: 1, pageSize: 20, total: 2 },
        baseComponent: { key: "test-project", name: "Test", qualifier: "TRK" },
        components: [
          {
            key: "test-project:src/clean.ts",
            name: "clean.ts",
            qualifier: "FIL",
            path: "src/clean.ts",
            measures: [
              { metric: "bugs", value: "0" },
              { metric: "vulnerabilities", value: "0" },
              { metric: "code_smells", value: "0" },
              { metric: "security_hotspots", value: "0" },
            ],
          },
        ],
      };

      mockFetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse)))
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getWorstFiles("test-project");

      expect(result).toHaveLength(0);
    });

    test("handles API errors gracefully", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getWorstFiles("test-project");

      expect(result).toEqual([]);
    });
  });

  describe("formatWorstFilesForAgent", () => {
    test("formats files as markdown table", () => {
      const files = [
        {
          path: "src/bad.ts",
          language: "ts",
          bugs: 5,
          vulnerabilities: 2,
          codeSmells: 20,
          securityHotspots: 1,
          total: 28,
        },
      ];

      const output = api.formatWorstFilesForAgent(files);

      expect(output).toContain("## Files with Most Issues");
      expect(output).toContain("src/bad.ts");
      expect(output).toContain("| 5 |");
      expect(output).toContain("**28**");
    });

    test("shows clean message when no files have issues", () => {
      const output = api.formatWorstFilesForAgent([]);

      expect(output).toContain("No files with issues found");
      expect(output).toContain("clean");
    });

    test("includes priority recommendations", () => {
      const files = [
        {
          path: "src/buggy.ts",
          bugs: 5,
          vulnerabilities: 0,
          codeSmells: 10,
          securityHotspots: 0,
          total: 15,
        },
        {
          path: "src/vuln.ts",
          bugs: 0,
          vulnerabilities: 3,
          codeSmells: 5,
          securityHotspots: 0,
          total: 8,
        },
      ];

      const output = api.formatWorstFilesForAgent(files);

      expect(output).toContain("Priority 1");
      expect(output).toContain("buggy.ts");
      expect(output).toContain("Priority 2");
      expect(output).toContain("vuln.ts");
    });

    test("truncates long file list", () => {
      const files = Array.from({ length: 25 }, (_, i) => ({
        path: `src/file${i}.ts`,
        bugs: 1,
        vulnerabilities: 0,
        codeSmells: 1,
        securityHotspots: 0,
        total: 2,
      }));

      const output = api.formatWorstFilesForAgent(files);

      expect(output).toContain("and 5 more files");
    });

    test("shortens long file paths", () => {
      const files = [
        {
          path: "src/very/deeply/nested/directory/structure/with/extra/depth/file.ts",
          bugs: 1,
          vulnerabilities: 0,
          codeSmells: 1,
          securityHotspots: 0,
          total: 2,
        },
      ];

      const output = api.formatWorstFilesForAgent(files);

      // Path is long enough to be shortened and contains ...
      expect(output).toContain("...");
      expect(output).toContain("file.ts");
    });
  });

  describe("getWorstDirectories", () => {
    test("returns directories sorted by total issues", async () => {
      const mockResponse = {
        paging: { pageIndex: 1, pageSize: 10, total: 1 },
        baseComponent: { key: "test-project", name: "Test", qualifier: "TRK" },
        components: [
          {
            key: "test-project:src",
            name: "src",
            qualifier: "DIR",
            path: "src",
            measures: [
              { metric: "bugs", value: "10" },
              { metric: "vulnerabilities", value: "5" },
              { metric: "code_smells", value: "50" },
              { metric: "security_hotspots", value: "2" },
            ],
          },
        ],
      };

      mockFetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(mockResponse)))
      );
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getWorstDirectories("test-project");

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src");
      expect(result[0].total).toBe(67);
    });

    test("handles API errors gracefully", async () => {
      mockFetch = mock(() => Promise.reject(new Error("Network error")));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await api.getWorstDirectories("test-project");

      expect(result).toEqual([]);
    });
  });
});
