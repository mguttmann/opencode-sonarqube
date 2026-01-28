/**
 * Table Formatting
 */

/**
 * Table row data as array of strings
 */
export type TableRow = string[];

/**
 * Format data as a markdown table.
 *
 * @param headers - Array of column headers
 * @param rows - 2D array of row data (each row is an array of cell values)
 * @returns Formatted markdown table
 *
 * @example
 * formatTable(["Name", "Value"], [["Coverage", "85%"], ["Bugs", "0"]])
 * // Returns:
 * // | Name | Value |
 * // |------|-------|
 * // | Coverage | 85% |
 * // | Bugs | 0 |
 */
export function formatTable(headers: string[], rows: TableRow[]): string {
  if (headers.length === 0) {
    return "";
  }

  // Build header row
  const headerRow = `| ${headers.join(" | ")} |`;

  // Build separator row with proper alignment
  const separatorRow = `|${headers.map(() => "------").join("|")}|`;

  // Build data rows
  const dataRows = rows.map((row) => {
    // Ensure row has correct number of columns
    const paddedRow = [...row];
    while (paddedRow.length < headers.length) {
      paddedRow.push("");
    }
    return `| ${paddedRow.slice(0, headers.length).join(" | ")} |`;
  });

  return [headerRow, separatorRow, ...dataRows].join("\n");
}
