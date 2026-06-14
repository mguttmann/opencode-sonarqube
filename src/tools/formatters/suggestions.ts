/**
 * Fix suggestions formatter
 */

import type { FormattedIssue } from "../../types/index.ts";

/**
 * Format fix suggestions for critical issues
 */
export function formatFixSuggestions(issues: FormattedIssue[]): string {
  const blockers = issues.filter((i) => i.severity === "BLOCKER");
  const critical = issues.filter((i) => i.severity === "CRITICAL");

  if (blockers.length === 0 && critical.length === 0) {
    return "";
  }

  let output = "\n\n---\n\n## Fix Suggestions\n\n";
  output += "Based on the issues found, here are recommended actions:\n\n";

  if (blockers.length > 0) {
    output += "### Immediate Fixes Required (Blockers)\n";
    for (const issue of blockers.slice(0, 5)) {
      output += `1. **${issue.file}:${issue.line ?? "?"}** - ${issue.message}\n`;
      output += `   - Rule: \`${issue.rule}\` - Review and fix this security/reliability issue\n\n`;
    }
  }

  if (critical.length > 0) {
    output += "### High Priority Fixes (Critical)\n";
    for (const issue of critical.slice(0, 5)) {
      output += `1. **${issue.file}:${issue.line ?? "?"}** - ${issue.message}\n`;
      output += `   - Rule: \`${issue.rule}\`\n\n`;
    }
  }

  return output;
}
