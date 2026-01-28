/**
 * Severity utilities - single source of truth
 */

import type { IssueType, FormattedIssue } from "../types/index.ts";

/**
 * All severity levels in priority order (highest first)
 */
export const SEVERITIES = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"] as const;
export type IssueSeverity = typeof SEVERITIES[number];

/**
 * Severity levels mapping - each level includes all higher severity levels
 */
export const SEVERITY_LEVELS: Record<string, IssueSeverity[]> = {
  blocker: ["BLOCKER"],
  critical: ["BLOCKER", "CRITICAL"],
  major: ["BLOCKER", "CRITICAL", "MAJOR"],
  minor: ["BLOCKER", "CRITICAL", "MAJOR", "MINOR"],
  info: ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"],
  all: ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"],
};

/**
 * Get severities to filter by based on a minimum level
 */
export function getSeveritiesFromLevel(level: string): IssueSeverity[] {
  return SEVERITY_LEVELS[level.toLowerCase()] ?? [...SEVERITIES];
}

/**
 * Get severity priority (lower index = higher priority)
 */
export function getSeverityPriority(severity: IssueSeverity): number {
  return SEVERITIES.indexOf(severity);
}

/**
 * Severity priority for sorting (higher = more severe)
 */
const SEVERITY_PRIORITY: Record<IssueSeverity, number> = {
  BLOCKER: 5,
  CRITICAL: 4,
  MAJOR: 3,
  MINOR: 2,
  INFO: 1,
};

/**
 * Type priority for sorting (higher = more important)
 */
const TYPE_PRIORITY: Record<IssueType, number> = {
  VULNERABILITY: 4,
  BUG: 3,
  SECURITY_HOTSPOT: 2,
  CODE_SMELL: 1,
};

/**
 * Emoji indicators for severities
 */
const SEVERITY_EMOJI: Record<IssueSeverity, string> = {
  BLOCKER: "!!", // Using text instead of emojis as per guidelines
  CRITICAL: "!",
  MAJOR: "*",
  MINOR: "-",
  INFO: "i",
};

/**
 * Emoji indicators for issue types
 */
const TYPE_EMOJI: Record<IssueType, string> = {
  BUG: "[BUG]",
  VULNERABILITY: "[VULN]",
  CODE_SMELL: "[SMELL]",
  SECURITY_HOTSPOT: "[HOTSPOT]",
};

/**
 * Sort issues by severity and type (most severe first)
 */
export function sortIssuesBySeverity(issues: FormattedIssue[]): FormattedIssue[] {
  return [...issues].sort((a, b) => {
    // First, sort by severity
    const severityDiff =
      SEVERITY_PRIORITY[b.severity] - SEVERITY_PRIORITY[a.severity];
    if (severityDiff !== 0) return severityDiff;

    // Then by type
    const typeDiff = TYPE_PRIORITY[b.type] - TYPE_PRIORITY[a.type];
    if (typeDiff !== 0) return typeDiff;

    // Finally by file and line
    const fileCompare = a.file.localeCompare(b.file);
    if (fileCompare !== 0) return fileCompare;

    return (a.line ?? 0) - (b.line ?? 0);
  });
}

/**
 * Group issues by severity
 */
export function groupIssuesBySeverity(
  issues: FormattedIssue[]
): Record<IssueSeverity, FormattedIssue[]> {
  const groups: Record<IssueSeverity, FormattedIssue[]> = {
    BLOCKER: [],
    CRITICAL: [],
    MAJOR: [],
    MINOR: [],
    INFO: [],
  };

  for (const issue of issues) {
    groups[issue.severity].push(issue);
  }

  return groups;
}

/**
 * Group issues by file
 */
export function groupIssuesByFile(
  issues: FormattedIssue[]
): Record<string, FormattedIssue[]> {
  const groups: Record<string, FormattedIssue[]> = {};

  for (const issue of issues) {
    if (!groups[issue.file]) {
      groups[issue.file] = [];
    }
    groups[issue.file].push(issue);
  }

  return groups;
}

/**
 * Format a single issue for display
 */
export function formatIssueForDisplay(issue: FormattedIssue): string {
  const severity = SEVERITY_EMOJI[issue.severity];
  const type = TYPE_EMOJI[issue.type];
  const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
  const quickFix = issue.quickFixAvailable ? " [Quick Fix Available]" : "";

  return `${severity} ${type} ${issue.message}\n   at ${location}${quickFix}\n   Rule: ${issue.rule}`;
}

/**
 * Format issues for agent consumption (markdown format)
 */
export function formatIssuesForAgent(
  issues: FormattedIssue[],
  qualityGateStatus: string
): string {
  if (issues.length === 0) {
    if (qualityGateStatus !== "OK") {
      return `## SonarQube Analysis Results

**Quality Gate: ${qualityGateStatus}**

No code issues found, but the Quality Gate is not passing.
This is typically caused by **unreviewed security hotspots** or **code duplication thresholds**.

**To fix:**
- \`sonarqube({ action: "hotspots" })\` — List security hotspots
- \`sonarqube({ action: "reviewhotspot", resolution: "SAFE" })\` — Bulk-review all hotspots as safe
- \`sonarqube({ action: "status" })\` — See which conditions are failing
- \`sonarqube({ action: "duplications" })\` — Check code duplication`;
    }
    return `## SonarQube Analysis Results\n\n**Quality Gate: ${qualityGateStatus}**\n\nNo issues found. Code quality looks good!`;
  }

  const sorted = sortIssuesBySeverity(issues);
  const grouped = groupIssuesBySeverity(sorted);

  const lines: string[] = [
    "## SonarQube Analysis Results",
    "",
    `**Quality Gate: ${qualityGateStatus}**`,
    "",
  ];

  // Summary
  const blockerCount = grouped.BLOCKER.length;
  const criticalCount = grouped.CRITICAL.length;
  const majorCount = grouped.MAJOR.length;
  const minorCount = grouped.MINOR.length;
  const infoCount = grouped.INFO.length;

  lines.push(
    "### Summary",
    `- Blockers: ${blockerCount}, Critical: ${criticalCount}, Major: ${majorCount}, Minor: ${minorCount}, Info: ${infoCount}`,
    ""
  );

  // Blocker issues (if any)
  if (grouped.BLOCKER.length > 0) {
    lines.push(
      "### !! BLOCKER Issues (Fix Immediately)",
      "",
      ...grouped.BLOCKER.map((issue) => formatIssueBlock(issue, 1)),
      ""
    );
  }

  // Critical issues (if any)
  if (grouped.CRITICAL.length > 0) {
    lines.push(
      "### ! Critical Issues",
      "",
      ...grouped.CRITICAL.map((issue) => formatIssueBlock(issue, 1)),
      ""
    );
  }

  // Major issues (if any)
  if (grouped.MAJOR.length > 0) {
    lines.push(
      "### * Major Issues",
      "",
      ...grouped.MAJOR.map((issue) => formatIssueBlock(issue, 1)),
      ""
    );
  }

  // Minor and Info collapsed
  const minorAndInfo = [...grouped.MINOR, ...grouped.INFO];
  if (minorAndInfo.length > 0) {
    const minorInfoLines = [
      `### Minor & Info Issues (${minorAndInfo.length} total)`,
      "",
      ...minorAndInfo.slice(0, 5).map((issue) => formatIssueBlock(issue, 1)),
    ];
    if (minorAndInfo.length > 5) {
      minorInfoLines.push(`... and ${minorAndInfo.length - 5} more`);
    }
    minorInfoLines.push("");
    lines.push(...minorInfoLines);
  }

  return lines.join("\n");
}

/**
 * Format a single issue as a numbered block
 */
function formatIssueBlock(issue: FormattedIssue, _number: number): string {
  const location = issue.line ? `\`${issue.file}:${issue.line}\`` : `\`${issue.file}\``;
  const quickFix = issue.quickFixAvailable ? " (Quick Fix Available)" : "";

  return [
    `**${issue.type}**: ${issue.message}${quickFix}`,
    `   - Location: ${location}`,
    `   - Rule: \`${issue.rule}\``,
    issue.effort ? `   - Effort: ${issue.effort}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Get a short summary of issues
 */
export function getIssueSummary(issues: FormattedIssue[]): string {
  const grouped = groupIssuesBySeverity(issues);
  const parts: string[] = [];

  if (grouped.BLOCKER.length > 0) parts.push(`${grouped.BLOCKER.length} blockers`);
  if (grouped.CRITICAL.length > 0) parts.push(`${grouped.CRITICAL.length} critical`);
  if (grouped.MAJOR.length > 0) parts.push(`${grouped.MAJOR.length} major`);
  if (grouped.MINOR.length > 0) parts.push(`${grouped.MINOR.length} minor`);
  if (grouped.INFO.length > 0) parts.push(`${grouped.INFO.length} info`);

  if (parts.length === 0) return "No issues";
  return parts.join(", ");
}
