/**
 * Project Formatting
 */

import { formatInlineCode } from "./code.ts";
import { formatKeyValue } from "./section.ts";

/**
 * Format a project header with key information
 *
 * @param projectKey - The project key
 * @param additionalInfo - Optional additional key-value pairs to display
 * @returns Formatted project header
 */
export function formatProjectHeader(
  projectKey: string,
  additionalInfo?: Record<string, string | number>
): string {
  const lines: string[] = [`**Project:** ${formatInlineCode(projectKey)}`];

  if (additionalInfo) {
    lines.push(...Object.entries(additionalInfo).map(([key, value]) => formatKeyValue(key, value)));
  }

  return lines.join("\n");
}

/**
 * Format an "empty state" message when no data is found
 *
 * @param entity - What was being searched for (e.g., "issues", "hotspots")
 * @param projectKey - The project key
 * @param positiveMessage - Optional positive message to display
 * @returns Formatted empty state message
 */
export function formatEmptyState(
  entity: string,
  projectKey: string,
  positiveMessage?: string
): string {
  const lines: string[] = [
    formatProjectHeader(projectKey),
    "",
    `No ${entity} found.`,
    ...(positiveMessage ? [positiveMessage] : []),
  ];

  return lines.join("\n");
}
