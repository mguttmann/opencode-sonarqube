/**
 * Quality Gate Formatting
 */

/** Icon constants for quality gate status */
export const QUALITY_GATE_ICONS = {
  PASS: "[PASS]",
  FAIL: "[FAIL]",
} as const;

/**
 * Format a passing quality gate status.
 *
 * @param status - The quality gate status string
 * @returns Formatted quality gate status line with pass icon
 *
 * @example
 * formatQualityGatePassed("OK")
 * // Returns: "[PASS] OK"
 */
export function formatQualityGatePassed(status: string): string {
  return `${QUALITY_GATE_ICONS.PASS} ${status}`;
}

/**
 * Format a failing quality gate status.
 *
 * @param status - The quality gate status string
 * @returns Formatted quality gate status line with fail icon
 *
 * @example
 * formatQualityGateFailed("ERROR")
 * // Returns: "[FAIL] ERROR"
 */
export function formatQualityGateFailed(status: string): string {
  return `${QUALITY_GATE_ICONS.FAIL} ${status}`;
}

/**
 * Format quality gate status with icon and styling.
 * Determines the appropriate icon based on the status value.
 *
 * @param status - The quality gate status string
 * @returns Formatted quality gate status line
 *
 * @example
 * formatQualityGate("OK")
 * // Returns: "[PASS] OK"
 *
 * formatQualityGate("ERROR")
 * // Returns: "[FAIL] ERROR"
 */
export function formatQualityGate(status: string): string {
  const isPassing = status === "OK" || status === "NONE";
  return isPassing ? formatQualityGatePassed(status) : formatQualityGateFailed(status);
}

/**
 * Format failed conditions as markdown lines
 */
function formatFailedConditions(
  conditions: Array<{ metric: string; actual: string; threshold: string }>
): string[] {
  if (conditions.length === 0) return [];
  
  return [
    "",
    "**Failed Conditions:**",
    ...conditions.map(
      (c) => `- **${c.metric}**: ${c.actual} (threshold: ${c.threshold})`
    ),
  ];
}

/**
 * Format a complete quality gate section with status and optional conditions.
 *
 * @param status - The quality gate status
 * @param failedConditions - Optional array of failed condition descriptions
 * @returns Formatted quality gate section
 */
export function formatQualityGateSection(
  status: string,
  failedConditions?: Array<{ metric: string; actual: string; threshold: string }>
): string {
  const isPassing = status === "OK" || status === "NONE";
  const formattedStatus = formatQualityGate(status);
  
  const lines: string[] = [`**Quality Gate:** ${formattedStatus}`];

  if (!isPassing && failedConditions && failedConditions.length > 0) {
    lines.push(...formatFailedConditions(failedConditions));
  }

  return lines.join("\n");
}
