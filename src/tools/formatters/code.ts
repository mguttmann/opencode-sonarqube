/**
 * Code Formatting
 */

/**
 * Format code as inline code
 *
 * @param code - The code to format
 * @returns Formatted inline code
 */
export function formatInlineCode(code: string): string {
  return `\`${code}\``;
}

/**
 * Format a code block with optional language
 *
 * @param code - The code content
 * @param language - Optional language for syntax highlighting
 * @returns Formatted code block
 */
export function formatCodeBlock(code: string, language: string = ""): string {
  return `\`\`\`${language}
${code}
\`\`\``;
}
