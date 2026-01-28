/**
 * Tests for Output Formatters
 */

import { describe, it, expect } from "bun:test";
import {
  formatError,
  formatSuccess,
  formatTable,
  formatIssuesList,
  formatIssuesSummary,
  formatMetrics,
  formatQualityGatePassed,
  formatQualityGateFailed,
  formatQualityGate,
  formatQualityGateSection,
  formatSection,
  formatList,
  formatKeyValue,
  formatInlineCode,
  formatCodeBlock,
  formatProjectHeader,
  formatEmptyState,
  SEVERITIES,
} from "./formatters.ts";
import type { FormattedIssue } from "../types/index.ts";

describe("Output Formatters", () => {
  describe("formatError", () => {
    it("formats error message with header", () => {
      const result = formatError("Connection failed");
      expect(result).toBe(`## SonarQube Error

Connection failed`);
    });

    it("handles empty message", () => {
      const result = formatError("");
      expect(result).toBe(`## SonarQube Error

`);
    });

    it("handles multi-line error messages", () => {
      const result = formatError("Line 1\nLine 2\nLine 3");
      expect(result).toContain("Line 1");
      expect(result).toContain("Line 2");
      expect(result).toContain("Line 3");
    });
  });

  describe("formatSuccess", () => {
    it("formats success message with title and content", () => {
      const result = formatSuccess("Analysis Complete", "Found 5 issues");
      expect(result).toBe(`## SonarQube: Analysis Complete

Found 5 issues`);
    });

    it("handles empty content", () => {
      const result = formatSuccess("Title", "");
      expect(result).toBe(`## SonarQube: Title

`);
    });

    it("handles multi-line content", () => {
      const result = formatSuccess("Status", "Line 1\nLine 2");
      expect(result).toContain("Line 1");
      expect(result).toContain("Line 2");
    });
  });

  describe("formatTable", () => {
    it("formats table with headers and rows", () => {
      const result = formatTable(
        ["Name", "Value"],
        [
          ["Coverage", "85%"],
          ["Bugs", "0"],
        ]
      );
      expect(result).toContain("| Name | Value |");
      expect(result).toContain("|------|------|");
      expect(result).toContain("| Coverage | 85% |");
      expect(result).toContain("| Bugs | 0 |");
    });

    it("returns empty string for empty headers", () => {
      const result = formatTable([], [["a", "b"]]);
      expect(result).toBe("");
    });

    it("handles empty rows array", () => {
      const result = formatTable(["A", "B"], []);
      expect(result).toContain("| A | B |");
      expect(result).toContain("|------|------|");
      // Should not have any data rows
      const lines = result.split("\n");
      expect(lines.length).toBe(2);
    });

    it("pads rows with fewer columns than headers", () => {
      const result = formatTable(["A", "B", "C"], [["only one"]]);
      expect(result).toContain("| only one |  |  |");
    });

    it("truncates rows with more columns than headers", () => {
      const result = formatTable(["A", "B"], [["one", "two", "three", "four"]]);
      expect(result).toContain("| one | two |");
      expect(result).not.toContain("three");
      expect(result).not.toContain("four");
    });

    it("handles single column table", () => {
      const result = formatTable(["Header"], [["Row 1"], ["Row 2"]]);
      expect(result).toContain("| Header |");
      expect(result).toContain("| Row 1 |");
      expect(result).toContain("| Row 2 |");
    });
  });

  describe("formatIssuesList", () => {
    it("returns positive message for empty issues array", () => {
      const result = formatIssuesList([]);
      expect(result).toBe("No issues found. Code quality looks good!");
    });

    it("formats issues grouped by severity", () => {
      const issues: FormattedIssue[] = [
        {
          key: "1",
          severity: "CRITICAL",
          type: "BUG",
          rule: "ts:S123",
          message: "Critical bug",
          file: "src/app.ts",
          line: 10,
          quickFixAvailable: false,
        },
        {
          key: "2",
          severity: "MAJOR",
          type: "CODE_SMELL",
          rule: "ts:S456",
          message: "Major smell",
          file: "src/util.ts",
          line: 20,
          quickFixAvailable: false,
        },
      ];
      const result = formatIssuesList(issues);
      expect(result).toContain("### CRITICAL (1)");
      expect(result).toContain("### MAJOR (1)");
      expect(result).toContain("src/app.ts:10");
      expect(result).toContain("src/util.ts:20");
    });

    it("shows severity indicators", () => {
      const issues: FormattedIssue[] = [
        { key: "1", severity: "BLOCKER", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
        { key: "2", severity: "CRITICAL", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
        { key: "3", severity: "MAJOR", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
        { key: "4", severity: "MINOR", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
        { key: "5", severity: "INFO", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
      ];
      const result = formatIssuesList(issues);
      expect(result).toContain("[!!]"); // BLOCKER
      expect(result).toContain("[!]"); // CRITICAL
      expect(result).toContain("[*]"); // MAJOR
      expect(result).toContain("[-]"); // MINOR
      expect(result).toContain("[i]"); // INFO
    });

    it("shows quick fix indicator when available", () => {
      const issues: FormattedIssue[] = [
        {
          key: "1",
          severity: "MAJOR",
          type: "BUG",
          rule: "ts:S123",
          message: "Bug",
          file: "src/app.ts",
          line: 10,
          quickFixAvailable: true,
        },
      ];
      const result = formatIssuesList(issues);
      expect(result).toContain("(quick fix available)");
    });

    it("handles issue without line number", () => {
      const issues: FormattedIssue[] = [
        {
          key: "1",
          severity: "MAJOR",
          type: "BUG",
          rule: "ts:S123",
          message: "File-level issue",
          file: "src/app.ts",
          quickFixAvailable: false,
        },
      ];
      const result = formatIssuesList(issues);
      expect(result).toContain("src/app.ts");
      expect(result).not.toContain("src/app.ts:");
    });

    it("respects maxPerSeverity limit", () => {
      const issues: FormattedIssue[] = Array.from({ length: 15 }, (_, i) => ({
        key: `${i}`,
        severity: "MAJOR" as const,
        type: "BUG" as const,
        rule: "ts:S123",
        message: `Issue ${i}`,
        file: `src/file${i}.ts`,
        line: i,
        quickFixAvailable: false,
      }));
      const result = formatIssuesList(issues, 5);
      expect(result).toContain("... and 10 more MAJOR issues");
    });

    it("orders severities from most to least severe", () => {
      const issues: FormattedIssue[] = [
        { key: "1", severity: "INFO", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
        { key: "2", severity: "BLOCKER", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
        { key: "3", severity: "MINOR", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
      ];
      const result = formatIssuesList(issues);
      const blockerPos = result.indexOf("BLOCKER");
      const minorPos = result.indexOf("MINOR");
      const infoPos = result.indexOf("INFO");
      expect(blockerPos).toBeLessThan(minorPos);
      expect(minorPos).toBeLessThan(infoPos);
    });
  });

  describe("formatIssuesSummary", () => {
    it("returns 'No issues' for empty array", () => {
      const result = formatIssuesSummary([]);
      expect(result).toBe("No issues");
    });

    it("formats counts by severity", () => {
      const issues: FormattedIssue[] = [
        { key: "1", severity: "CRITICAL", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
        { key: "2", severity: "CRITICAL", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
        { key: "3", severity: "MAJOR", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
      ];
      const result = formatIssuesSummary(issues);
      expect(result).toContain("CRITICAL: 2");
      expect(result).toContain("MAJOR: 1");
    });

    it("only shows severities with issues", () => {
      const issues: FormattedIssue[] = [
        { key: "1", severity: "MINOR", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
      ];
      const result = formatIssuesSummary(issues);
      expect(result).toBe("MINOR: 1");
      expect(result).not.toContain("BLOCKER");
      expect(result).not.toContain("CRITICAL");
    });

    it("separates severities with pipe", () => {
      const issues: FormattedIssue[] = [
        { key: "1", severity: "BLOCKER", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
        { key: "2", severity: "INFO", type: "BUG", rule: "r", message: "m", file: "f", quickFixAvailable: false },
      ];
      const result = formatIssuesSummary(issues);
      expect(result).toContain(" | ");
    });
  });

  describe("formatMetrics", () => {
    it("formats metrics without title", () => {
      const result = formatMetrics({ Lines: 1000, Bugs: 5 });
      expect(result).toContain("| Metric | Value |");
      expect(result).toContain("| Lines | 1,000 |");
      expect(result).toContain("| Bugs | 5 |");
    });

    it("formats metrics with title", () => {
      const result = formatMetrics({ Lines: 100 }, "Code Metrics");
      expect(result).toContain("### Code Metrics");
      expect(result).toContain("| Metric | Value |");
    });

    it("formats coverage percentages", () => {
      const result = formatMetrics({ Coverage: 85.567 });
      expect(result).toContain("| Coverage | 85.6% |");
    });

    it("formats duplication percentages", () => {
      const result = formatMetrics({ Duplication: 3.14159 });
      expect(result).toContain("| Duplication | 3.1% |");
    });

    it("formats integers without decimals", () => {
      const result = formatMetrics({ Count: 42 });
      expect(result).toContain("| Count | 42 |");
    });

    it("formats floats with 2 decimal places", () => {
      const result = formatMetrics({ Rating: 3.14159 });
      expect(result).toContain("| Rating | 3.14 |");
    });

    it("handles string values", () => {
      const result = formatMetrics({ Status: "OK" });
      expect(result).toContain("| Status | OK |");
    });

    it("skips undefined values", () => {
      const result = formatMetrics({ Defined: "yes", Undefined: undefined });
      expect(result).toContain("Defined");
      expect(result).not.toContain("Undefined");
    });

    it("returns 'No metrics available' for empty metrics without title", () => {
      const result = formatMetrics({});
      expect(result).toBe("No metrics available.");
    });

    it("returns title with 'No metrics available' for empty metrics with title", () => {
      const result = formatMetrics({}, "Empty Metrics");
      expect(result).toBe("### Empty Metrics\n\nNo metrics available.");
    });
  });

  describe("formatQualityGatePassed", () => {
    it("formats passing status with icon", () => {
      const result = formatQualityGatePassed("OK");
      expect(result).toBe("[PASS] OK");
    });

    it("handles any status string", () => {
      const result = formatQualityGatePassed("CUSTOM_STATUS");
      expect(result).toBe("[PASS] CUSTOM_STATUS");
    });
  });

  describe("formatQualityGateFailed", () => {
    it("formats failing status with icon", () => {
      const result = formatQualityGateFailed("ERROR");
      expect(result).toBe("[FAIL] ERROR");
    });

    it("handles any status string", () => {
      const result = formatQualityGateFailed("FAILED");
      expect(result).toBe("[FAIL] FAILED");
    });
  });

  describe("formatQualityGate", () => {
    it("formats OK status as passing", () => {
      const result = formatQualityGate("OK");
      expect(result).toBe("[PASS] OK");
    });

    it("formats NONE status as passing", () => {
      const result = formatQualityGate("NONE");
      expect(result).toBe("[PASS] NONE");
    });

    it("formats ERROR status as failing", () => {
      const result = formatQualityGate("ERROR");
      expect(result).toBe("[FAIL] ERROR");
    });

    it("formats WARN status as failing", () => {
      const result = formatQualityGate("WARN");
      expect(result).toBe("[FAIL] WARN");
    });

    it("formats unknown status as failing", () => {
      const result = formatQualityGate("UNKNOWN");
      expect(result).toBe("[FAIL] UNKNOWN");
    });
  });

  describe("formatQualityGateSection", () => {
    it("formats passing quality gate", () => {
      const result = formatQualityGateSection("OK");
      expect(result).toBe("**Quality Gate:** [PASS] OK");
    });

    it("formats failing quality gate without conditions", () => {
      const result = formatQualityGateSection("ERROR");
      expect(result).toBe("**Quality Gate:** [FAIL] ERROR");
    });

    it("formats failing quality gate with conditions", () => {
      const result = formatQualityGateSection("ERROR", [
        { metric: "coverage", actual: "50%", threshold: "80%" },
        { metric: "bugs", actual: "5", threshold: "0" },
      ]);
      expect(result).toContain("**Quality Gate:** [FAIL] ERROR");
      expect(result).toContain("**Failed Conditions:**");
      expect(result).toContain("- **coverage**: 50% (threshold: 80%)");
      expect(result).toContain("- **bugs**: 5 (threshold: 0)");
    });

    it("does not show conditions for passing status even if provided", () => {
      const result = formatQualityGateSection("OK", [
        { metric: "test", actual: "1", threshold: "2" },
      ]);
      expect(result).not.toContain("Failed Conditions");
    });

    it("does not show conditions section for empty conditions array", () => {
      const result = formatQualityGateSection("ERROR", []);
      expect(result).not.toContain("Failed Conditions");
    });
  });

  describe("formatSection", () => {
    it("formats section with default level 2", () => {
      const result = formatSection("Title", "Content");
      expect(result).toBe(`## Title

Content`);
    });

    it("formats section with level 1", () => {
      const result = formatSection("Title", "Content", 1);
      expect(result).toContain("# Title");
    });

    it("formats section with level 3", () => {
      const result = formatSection("Title", "Content", 3);
      expect(result).toContain("### Title");
    });

    it("formats section with level 6", () => {
      const result = formatSection("Title", "Content", 6);
      expect(result).toContain("###### Title");
    });

    it("clamps level to minimum 1", () => {
      const result = formatSection("Title", "Content", 0);
      expect(result).toContain("# Title");
    });

    it("clamps level to maximum 6", () => {
      const result = formatSection("Title", "Content", 10);
      expect(result).toContain("###### Title");
    });

    it("handles negative levels", () => {
      const result = formatSection("Title", "Content", -5);
      expect(result).toContain("# Title");
    });
  });

  describe("formatList", () => {
    it("returns empty string for empty array", () => {
      const result = formatList([]);
      expect(result).toBe("");
    });

    it("formats unordered list by default", () => {
      const result = formatList(["Item 1", "Item 2", "Item 3"]);
      expect(result).toBe("- Item 1\n- Item 2\n- Item 3");
    });

    it("formats ordered list when specified", () => {
      const result = formatList(["First", "Second", "Third"], true);
      expect(result).toBe("1. First\n2. Second\n3. Third");
    });

    it("handles single item", () => {
      const result = formatList(["Only item"]);
      expect(result).toBe("- Only item");
    });

    it("handles single item ordered", () => {
      const result = formatList(["Only item"], true);
      expect(result).toBe("1. Only item");
    });
  });

  describe("formatKeyValue", () => {
    it("formats with bold key by default", () => {
      const result = formatKeyValue("Status", "OK");
      expect(result).toBe("**Status:** OK");
    });

    it("formats with non-bold key when specified", () => {
      const result = formatKeyValue("Status", "OK", false);
      expect(result).toBe("Status: OK");
    });

    it("handles numeric values", () => {
      const result = formatKeyValue("Count", 42);
      expect(result).toBe("**Count:** 42");
    });

    it("handles empty value", () => {
      const result = formatKeyValue("Key", "");
      expect(result).toBe("**Key:** ");
    });
  });

  describe("formatInlineCode", () => {
    it("wraps code in backticks", () => {
      const result = formatInlineCode("variable");
      expect(result).toBe("`variable`");
    });

    it("handles empty string", () => {
      const result = formatInlineCode("");
      expect(result).toBe("``");
    });

    it("handles code with special characters", () => {
      const result = formatInlineCode("foo.bar()");
      expect(result).toBe("`foo.bar()`");
    });
  });

  describe("formatCodeBlock", () => {
    it("formats code block without language", () => {
      const result = formatCodeBlock("const x = 1;");
      expect(result).toBe("```\nconst x = 1;\n```");
    });

    it("formats code block with language", () => {
      const result = formatCodeBlock("const x = 1;", "typescript");
      expect(result).toBe("```typescript\nconst x = 1;\n```");
    });

    it("handles multi-line code", () => {
      const result = formatCodeBlock("line1\nline2\nline3", "js");
      expect(result).toBe("```js\nline1\nline2\nline3\n```");
    });

    it("handles empty code", () => {
      const result = formatCodeBlock("");
      expect(result).toBe("```\n\n```");
    });
  });

  describe("formatProjectHeader", () => {
    it("formats project key only", () => {
      const result = formatProjectHeader("my-project");
      expect(result).toBe("**Project:** `my-project`");
    });

    it("formats project with additional info", () => {
      const result = formatProjectHeader("my-project", {
        Branch: "main",
        "Lines of Code": 1000,
      });
      expect(result).toContain("**Project:** `my-project`");
      expect(result).toContain("**Branch:** main");
      expect(result).toContain("**Lines of Code:** 1000");
    });

    it("handles empty additional info", () => {
      const result = formatProjectHeader("my-project", {});
      expect(result).toBe("**Project:** `my-project`");
    });
  });

  describe("formatEmptyState", () => {
    it("formats empty state without positive message", () => {
      const result = formatEmptyState("issues", "my-project");
      expect(result).toContain("**Project:** `my-project`");
      expect(result).toContain("No issues found.");
    });

    it("formats empty state with positive message", () => {
      const result = formatEmptyState(
        "issues",
        "my-project",
        "Great job keeping the code clean!"
      );
      expect(result).toContain("**Project:** `my-project`");
      expect(result).toContain("No issues found.");
      expect(result).toContain("Great job keeping the code clean!");
    });

    it("works with different entity types", () => {
      const result = formatEmptyState("security hotspots", "proj");
      expect(result).toContain("No security hotspots found.");
    });
  });

  describe("SEVERITIES", () => {
    it("exports severities constant from central source", () => {
      expect(SEVERITIES).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]);
    });
  });
});
