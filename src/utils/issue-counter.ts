/**
 * Issue counting utilities
 */

import { SEVERITIES, type IssueSeverity } from "./severity.ts";

/**
 * Count issues by severity
 */
export function countBySeverity(
  issues: Array<{ severity: IssueSeverity }>
): Record<IssueSeverity, number> {
  const counts = Object.fromEntries(
    SEVERITIES.map(s => [s, 0])
  ) as Record<IssueSeverity, number>;
  
  for (const issue of issues) {
    if (issue.severity in counts) {
      counts[issue.severity]++;
    }
  }
  
  return counts;
}

/**
 * Get total count of issues at or above a severity level
 */
export function countAtOrAboveSeverity(
  counts: Record<IssueSeverity, number>,
  minSeverity: IssueSeverity
): number {
  const index = SEVERITIES.indexOf(minSeverity);
  return SEVERITIES.slice(0, index + 1).reduce((sum, s) => sum + counts[s], 0);
}
