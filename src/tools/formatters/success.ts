/**
 * Success Formatting
 */

/**
 * Format a success response with a title and content.
 *
 * @param title - The section title (without ## prefix)
 * @param content - The content to display under the title
 * @returns Formatted markdown success block
 *
 * @example
 * formatSuccess("Analysis Complete", "Found 5 issues")
 * // Returns:
 * // ## SonarQube: Analysis Complete
 * //
 * // Found 5 issues
 */
export function formatSuccess(title: string, content: string): string {
  return `## SonarQube: ${title}

${content}`;
}
