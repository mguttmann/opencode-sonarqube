/**
 * Section Formatting Helpers
 */

/**
 * Format a section with a header and content
 *
 * @param title - Section title
 * @param content - Section content
 * @param level - Header level (1-6, default: 2)
 * @returns Formatted section
 */
export function formatSection(title: string, content: string, level: number = 2): string {
  const headerPrefix = "#".repeat(Math.min(Math.max(level, 1), 6));
  return `${headerPrefix} ${title}

${content}`;
}

/**
 * Format a list of items as markdown bullet points
 *
 * @param items - Array of items to list
 * @param ordered - Whether to use ordered (numbered) list
 * @returns Formatted list
 */
export function formatList(items: string[], ordered: boolean = false): string {
  if (items.length === 0) {
    return "";
  }

  return items
    .map((item, index) => {
      const prefix = ordered ? `${index + 1}.` : "-";
      return `${prefix} ${item}`;
    })
    .join("\n");
}

/**
 * Format a key-value pair line
 *
 * @param key - The key/label
 * @param value - The value
 * @param bold - Whether to bold the key
 * @returns Formatted key-value line
 */
export function formatKeyValue(key: string, value: string | number, bold: boolean = true): string {
  const formattedKey = bold ? `**${key}:**` : `${key}:`;
  return `${formattedKey} ${value}`;
}
