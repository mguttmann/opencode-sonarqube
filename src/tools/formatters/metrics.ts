/**
 * Metrics Formatting
 */

import { formatTable, type TableRow } from "./table.ts";

/**
 * Generic metrics object with string or number values
 */
export type MetricsRecord = Record<string, string | number | undefined>;

/**
 * Format metrics as a markdown table.
 *
 * Filters out undefined values and formats numbers appropriately.
 *
 * @param metrics - Record of metric names to values
 * @param title - Optional section title
 * @returns Formatted markdown metrics table
 *
 * @example
 * formatMetrics({ Coverage: 85.5, Bugs: 0, "Code Smells": 12 })
 */
export function formatMetrics(metrics: MetricsRecord, title?: string): string {
  const lines: string[] = title ? [`### ${title}`, ""] : [];

  const rows: TableRow[] = [];

  for (const [key, value] of Object.entries(metrics)) {
    if (value === undefined) continue;

    let displayValue: string;
    if (typeof value === "number") {
      // Format percentages and ratings appropriately
      if (key.toLowerCase().includes("coverage") || key.toLowerCase().includes("duplication")) {
        displayValue = `${value.toFixed(1)}%`;
      } else if (Number.isInteger(value)) {
        displayValue = value.toLocaleString();
      } else {
        displayValue = value.toFixed(2);
      }
    } else {
      displayValue = String(value);
    }

    rows.push([key, displayValue]);
  }

  if (rows.length === 0) {
    return title ? `### ${title}\n\nNo metrics available.` : "No metrics available.";
  }

  lines.push(formatTable(["Metric", "Value"], rows));

  return lines.join("\n");
}
