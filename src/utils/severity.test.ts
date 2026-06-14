/**
 * Tests for severity utilities
 */

import { describe, test, expect } from "bun:test";
import type { FormattedIssue } from "../types/index.ts";
import {
  SEVERITIES,
  SEVERITY_LEVELS,
  getSeveritiesFromLevel,
  getSeverityPriority,
  sortIssuesBySeverity,
  groupIssuesBySeverity,
  groupIssuesByFile,
  formatIssueForDisplay,
  formatIssuesForAgent,
  getIssueSummary,
} from "./severity.ts";

// Helper to create test issues
let issueCounter = 0;
function createIssue(overrides: Partial<FormattedIssue> = {}): FormattedIssue {
  issueCounter++;
  return {
    key: overrides.key ?? `test-issue-${issueCounter}`,
    severity: "MAJOR",
    type: "CODE_SMELL",
    rule: "test:rule",
    message: "Test message",
    file: "src/test.ts",
    line: 10,
    quickFixAvailable: false,
    ...overrides,
  };
}

describe("sortIssuesBySeverity", () => {
  test("sorts blockers first", () => {
    const issues: FormattedIssue[] = [
      createIssue({ severity: "MINOR" }),
      createIssue({ severity: "BLOCKER" }),
      createIssue({ severity: "MAJOR" }),
    ];

    const sorted = sortIssuesBySeverity(issues);
    expect(sorted[0].severity).toBe("BLOCKER");
    expect(sorted[1].severity).toBe("MAJOR");
    expect(sorted[2].severity).toBe("MINOR");
  });

  test("sorts by type when severity is equal", () => {
    const issues: FormattedIssue[] = [
      createIssue({ severity: "CRITICAL", type: "CODE_SMELL" }),
      createIssue({ severity: "CRITICAL", type: "VULNERABILITY" }),
      createIssue({ severity: "CRITICAL", type: "BUG" }),
    ];

    const sorted = sortIssuesBySeverity(issues);
    expect(sorted[0].type).toBe("VULNERABILITY");
    expect(sorted[1].type).toBe("BUG");
    expect(sorted[2].type).toBe("CODE_SMELL");
  });

  test("sorts by file when severity and type are equal", () => {
    const issues: FormattedIssue[] = [
      createIssue({ file: "src/z.ts" }),
      createIssue({ file: "src/a.ts" }),
      createIssue({ file: "src/m.ts" }),
    ];

    const sorted = sortIssuesBySeverity(issues);
    expect(sorted[0].file).toBe("src/a.ts");
    expect(sorted[1].file).toBe("src/m.ts");
    expect(sorted[2].file).toBe("src/z.ts");
  });

  test("sorts by line when file is equal", () => {
    const issues: FormattedIssue[] = [
      createIssue({ file: "src/a.ts", line: 100 }),
      createIssue({ file: "src/a.ts", line: 10 }),
      createIssue({ file: "src/a.ts", line: 50 }),
    ];

    const sorted = sortIssuesBySeverity(issues);
    expect(sorted[0].line).toBe(10);
    expect(sorted[1].line).toBe(50);
    expect(sorted[2].line).toBe(100);
  });

  test("handles undefined line numbers", () => {
    const issues: FormattedIssue[] = [
      createIssue({ file: "src/a.ts", line: 10 }),
      createIssue({ file: "src/a.ts", line: undefined }),
    ];

    const sorted = sortIssuesBySeverity(issues);
    expect(sorted[0].line).toBeUndefined();
    expect(sorted[1].line).toBe(10);
  });

  test("does not mutate original array", () => {
    const issues: FormattedIssue[] = [
      createIssue({ severity: "MINOR" }),
      createIssue({ severity: "BLOCKER" }),
    ];
    const original = [...issues];

    sortIssuesBySeverity(issues);
    expect(issues[0].severity).toBe(original[0].severity);
  });
});

describe("groupIssuesBySeverity", () => {
  test("groups issues by severity", () => {
    const issues: FormattedIssue[] = [
      createIssue({ severity: "BLOCKER" }),
      createIssue({ severity: "BLOCKER" }),
      createIssue({ severity: "CRITICAL" }),
      createIssue({ severity: "MAJOR" }),
      createIssue({ severity: "MINOR" }),
      createIssue({ severity: "INFO" }),
    ];

    const grouped = groupIssuesBySeverity(issues);
    expect(grouped.BLOCKER.length).toBe(2);
    expect(grouped.CRITICAL.length).toBe(1);
    expect(grouped.MAJOR.length).toBe(1);
    expect(grouped.MINOR.length).toBe(1);
    expect(grouped.INFO.length).toBe(1);
  });

  test("returns empty arrays for missing severities", () => {
    const issues: FormattedIssue[] = [createIssue({ severity: "BLOCKER" })];

    const grouped = groupIssuesBySeverity(issues);
    expect(grouped.CRITICAL).toEqual([]);
    expect(grouped.MAJOR).toEqual([]);
    expect(grouped.MINOR).toEqual([]);
    expect(grouped.INFO).toEqual([]);
  });

  test("handles empty input", () => {
    const grouped = groupIssuesBySeverity([]);
    expect(grouped.BLOCKER).toEqual([]);
    expect(grouped.CRITICAL).toEqual([]);
  });
});

describe("groupIssuesByFile", () => {
  test("groups issues by file", () => {
    const issues: FormattedIssue[] = [
      createIssue({ file: "src/a.ts" }),
      createIssue({ file: "src/a.ts" }),
      createIssue({ file: "src/b.ts" }),
    ];

    const grouped = groupIssuesByFile(issues);
    expect(grouped["src/a.ts"].length).toBe(2);
    expect(grouped["src/b.ts"].length).toBe(1);
  });

  test("handles empty input", () => {
    const grouped = groupIssuesByFile([]);
    expect(Object.keys(grouped).length).toBe(0);
  });
});

describe("formatIssueForDisplay", () => {
  test("formats issue with line number", () => {
    const issue = createIssue({
      severity: "CRITICAL",
      type: "BUG",
      message: "Null pointer",
      file: "src/main.ts",
      line: 42,
      rule: "ts:S1234",
    });

    const result = formatIssueForDisplay(issue);
    expect(result).toContain("!");
    expect(result).toContain("[BUG]");
    expect(result).toContain("Null pointer");
    expect(result).toContain("src/main.ts:42");
    expect(result).toContain("ts:S1234");
  });

  test("formats issue without line number", () => {
    const issue = createIssue({
      file: "src/main.ts",
      line: undefined,
    });

    const result = formatIssueForDisplay(issue);
    expect(result).toContain("src/main.ts");
    // Should not have file:line format
    expect(result).not.toContain("src/main.ts:");
  });

  test("includes quick fix indicator", () => {
    const issue = createIssue({ quickFixAvailable: true });

    const result = formatIssueForDisplay(issue);
    expect(result).toContain("[Quick Fix Available]");
  });
});

describe("formatIssuesForAgent", () => {
  test("formats empty issues list", () => {
    const result = formatIssuesForAgent([], "OK");
    expect(result).toContain("No issues found");
    expect(result).toContain("Quality Gate: OK");
  });

  test("includes quality gate status", () => {
    const issues: FormattedIssue[] = [createIssue({ severity: "MAJOR" })];
    const result = formatIssuesForAgent(issues, "ERROR");
    expect(result).toContain("Quality Gate: ERROR");
  });

  test("includes summary counts", () => {
    const issues: FormattedIssue[] = [
      createIssue({ severity: "BLOCKER" }),
      createIssue({ severity: "CRITICAL" }),
      createIssue({ severity: "CRITICAL" }),
      createIssue({ severity: "MAJOR" }),
    ];

    const result = formatIssuesForAgent(issues, "ERROR");
    expect(result).toContain("Blockers: 1");
    expect(result).toContain("Critical: 2");
    expect(result).toContain("Major: 1");
  });

  test("shows blocker section", () => {
    const issues: FormattedIssue[] = [createIssue({ severity: "BLOCKER" })];

    const result = formatIssuesForAgent(issues, "ERROR");
    expect(result).toContain("BLOCKER Issues");
  });

  test("shows critical section", () => {
    const issues: FormattedIssue[] = [createIssue({ severity: "CRITICAL" })];

    const result = formatIssuesForAgent(issues, "ERROR");
    expect(result).toContain("Critical Issues");
  });

  test("collapses minor and info issues", () => {
    const issues: FormattedIssue[] = Array(10)
      .fill(null)
      .map(() => createIssue({ severity: "MINOR" }));

    const result = formatIssuesForAgent(issues, "OK");
    expect(result).toContain("Minor & Info Issues");
    expect(result).toContain("and 5 more");
  });
});

describe("getIssueSummary", () => {
  test("returns 'No issues' for empty array", () => {
    expect(getIssueSummary([])).toBe("No issues");
  });

  test("includes blocker count", () => {
    const issues: FormattedIssue[] = [
      createIssue({ severity: "BLOCKER" }),
      createIssue({ severity: "BLOCKER" }),
    ];

    const result = getIssueSummary(issues);
    expect(result).toBe("2 blockers");
  });

  test("includes multiple severity counts", () => {
    const issues: FormattedIssue[] = [
      createIssue({ severity: "BLOCKER" }),
      createIssue({ severity: "CRITICAL" }),
      createIssue({ severity: "MAJOR" }),
    ];

    const result = getIssueSummary(issues);
    expect(result).toContain("1 blockers");
    expect(result).toContain("1 critical");
    expect(result).toContain("1 major");
  });

  test("omits zero counts", () => {
    const issues: FormattedIssue[] = [createIssue({ severity: "MAJOR" })];

    const result = getIssueSummary(issues);
    expect(result).not.toContain("blocker");
    expect(result).not.toContain("critical");
    expect(result).toBe("1 major");
  });
});

describe("SEVERITIES constant", () => {
  test("contains all severity levels in priority order", () => {
    expect(SEVERITIES).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]);
  });

  test("is readonly", () => {
    // TypeScript ensures this is readonly at compile time
    expect(SEVERITIES.length).toBe(5);
  });
});

describe("SEVERITY_LEVELS mapping", () => {
  test("blocker level returns only BLOCKER", () => {
    expect(SEVERITY_LEVELS.blocker).toEqual(["BLOCKER"]);
  });

  test("critical level returns BLOCKER and CRITICAL", () => {
    expect(SEVERITY_LEVELS.critical).toEqual(["BLOCKER", "CRITICAL"]);
  });

  test("major level returns BLOCKER, CRITICAL, MAJOR", () => {
    expect(SEVERITY_LEVELS.major).toEqual(["BLOCKER", "CRITICAL", "MAJOR"]);
  });

  test("minor level returns all except INFO", () => {
    expect(SEVERITY_LEVELS.minor).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR"]);
  });

  test("info level returns all severities", () => {
    expect(SEVERITY_LEVELS.info).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]);
  });

  test("all level returns all severities", () => {
    expect(SEVERITY_LEVELS.all).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]);
  });
});

describe("getSeveritiesFromLevel", () => {
  test("returns correct severities for blocker level", () => {
    expect(getSeveritiesFromLevel("blocker")).toEqual(["BLOCKER"]);
  });

  test("returns correct severities for critical level", () => {
    expect(getSeveritiesFromLevel("critical")).toEqual(["BLOCKER", "CRITICAL"]);
  });

  test("returns correct severities for major level", () => {
    expect(getSeveritiesFromLevel("major")).toEqual(["BLOCKER", "CRITICAL", "MAJOR"]);
  });

  test("returns correct severities for minor level", () => {
    expect(getSeveritiesFromLevel("minor")).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR"]);
  });

  test("returns correct severities for info level", () => {
    expect(getSeveritiesFromLevel("info")).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]);
  });

  test("returns correct severities for all level", () => {
    expect(getSeveritiesFromLevel("all")).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]);
  });

  test("handles uppercase input", () => {
    expect(getSeveritiesFromLevel("BLOCKER")).toEqual(["BLOCKER"]);
    expect(getSeveritiesFromLevel("CRITICAL")).toEqual(["BLOCKER", "CRITICAL"]);
  });

  test("handles mixed case input", () => {
    expect(getSeveritiesFromLevel("Blocker")).toEqual(["BLOCKER"]);
    expect(getSeveritiesFromLevel("CrItIcAl")).toEqual(["BLOCKER", "CRITICAL"]);
  });

  test("returns all severities for unknown level", () => {
    expect(getSeveritiesFromLevel("unknown")).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]);
  });

  test("returns all severities for empty string", () => {
    expect(getSeveritiesFromLevel("")).toEqual(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]);
  });
});

describe("getSeverityPriority", () => {
  test("BLOCKER has highest priority (0)", () => {
    expect(getSeverityPriority("BLOCKER")).toBe(0);
  });

  test("CRITICAL has second highest priority (1)", () => {
    expect(getSeverityPriority("CRITICAL")).toBe(1);
  });

  test("MAJOR has priority 2", () => {
    expect(getSeverityPriority("MAJOR")).toBe(2);
  });

  test("MINOR has priority 3", () => {
    expect(getSeverityPriority("MINOR")).toBe(3);
  });

  test("INFO has lowest priority (4)", () => {
    expect(getSeverityPriority("INFO")).toBe(4);
  });

  test("lower index means higher priority", () => {
    expect(getSeverityPriority("BLOCKER")).toBeLessThan(getSeverityPriority("CRITICAL"));
    expect(getSeverityPriority("CRITICAL")).toBeLessThan(getSeverityPriority("MAJOR"));
    expect(getSeverityPriority("MAJOR")).toBeLessThan(getSeverityPriority("MINOR"));
    expect(getSeverityPriority("MINOR")).toBeLessThan(getSeverityPriority("INFO"));
  });
});
