/**
 * Error Formatting
 */

/**
 * Format an error message with consistent styling.
 *
 * @param message - The error message to display
 * @returns Formatted markdown error block
 *
 * @example
 * formatError("Connection failed")
 * // Returns:
 * // ## SonarQube Error
 * //
 * // Connection failed
 */
export function formatError(message: string): string {
  return `## SonarQube Error

${message}`;
}
