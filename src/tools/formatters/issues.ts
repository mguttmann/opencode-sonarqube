/**
 * Issues Formatting
 */

import type { FormattedIssue } from "../../types/index.ts";
import { SEVERITIES, type IssueSeverity, groupIssuesBySeverity } from "../../utils/severity.ts";
import { countBySeverity } from "../../utils/issue-counter.ts";

/**
 * Get severity icon/indicator for display
 */
function getSeverityIndicator(severity: IssueSeverity): string {
  switch (severity) {
    case "BLOCKER":
      return "[!!]";
    case "CRITICAL":
      return "[!]";
    case "MAJOR":
      return "[*]";
    case "MINOR":
      return "[-]";
    case "INFO":
      return "[i]";
    /* c8 ignore next 2 - defensive code for unknown severities */
    default:
      return "[?]";
  }
}

/**
 * Format a single issue as markdown lines
 */
function formatSingleIssue(issue: FormattedIssue): string[] {
  const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
  const indicator = getSeverityIndicator(issue.severity);
  const quickFix = issue.quickFixAvailable ? " (quick fix available)" : "";
  return [
    `${indicator} **${location}** - ${issue.message}`,
    `  Rule: \`${issue.rule}\`${quickFix}`,
  ];
}

/**
 * Format a severity group as markdown lines
 */
function formatSeverityGroup(
  severity: IssueSeverity,
  issues: FormattedIssue[],
  maxIssues: number
): string[] {
  if (issues.length === 0) return [];

  const lines: string[] = [`### ${severity} (${issues.length})`, ""];

  const displayIssues = issues.slice(0, maxIssues);
  for (const issue of displayIssues) {
    lines.push(...formatSingleIssue(issue));
  }

  if (issues.length > maxIssues) {
    lines.push("", `*... and ${issues.length - maxIssues} more ${severity} issues*`);
  }

  lines.push("");
  return lines;
}

/**
 * Format a list of issues as markdown.
 *
 * Groups issues by severity and formats them for easy reading.
 * Limits display to prevent overwhelming output.
 *
 * @param issues - Array of formatted issues to display
 * @param maxPerSeverity - Maximum issues to show per severity level (default: 10)
 * @returns Formatted markdown issues list
 *
 * @example
 * formatIssuesList([
 *   { severity: "CRITICAL", file: "src/index.ts", line: 10, message: "Bug found", rule: "S123" }
 * ])
 */
export function formatIssuesList(issues: FormattedIssue[], maxPerSeverity: number = 10): string {
  if (issues.length === 0) {
    return "No issues found. Code quality looks good!";
  }

  const bySeverity = groupIssuesBySeverity(issues);
  const lines: string[] = [];

  for (const severity of SEVERITIES) {
    lines.push(...formatSeverityGroup(severity, bySeverity[severity], maxPerSeverity));
  }

  return lines.join("\n").trim();
}

/**
 * Format issues summary counts
 *
 * @param issues - Array of issues to summarize
 * @returns Summary line showing counts by severity
 */
export function formatIssuesSummary(issues: FormattedIssue[]): string {
  const counts = countBySeverity(issues);

  const parts: string[] = [];
  for (const severity of SEVERITIES) {
    if (counts[severity] > 0) {
      parts.push(`${severity}: ${counts[severity]}`);
    }
  }

  return parts.length > 0 ? parts.join(" | ") : "No issues";
}
