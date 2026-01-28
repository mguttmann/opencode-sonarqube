/**
 * Output Formatters for SonarQube Tool
 *
 * This module provides consistent, reusable formatting functions for
 * generating markdown output from SonarQube data. All formatters produce
 * clean, agent-friendly markdown that can be displayed in the CLI.
 */

// Re-export types
export type { QualityGateStatus } from "../../types/index.ts";

// Error formatting
export { formatError } from "./error.ts";

// Success formatting
export { formatSuccess } from "./success.ts";

// Table formatting
export { formatTable, type TableRow } from "./table.ts";

// Issues formatting
export { formatIssuesList, formatIssuesSummary } from "./issues.ts";

// Re-export severity utilities from central source
export { SEVERITIES, type IssueSeverity } from "../../utils/severity.ts";

// Metrics formatting
export { formatMetrics, type MetricsRecord } from "./metrics.ts";

// Quality gate formatting
export {
  formatQualityGate,
  formatQualityGatePassed,
  formatQualityGateFailed,
  formatQualityGateSection,
  QUALITY_GATE_ICONS,
} from "./quality-gate.ts";

// Section formatting
export { formatSection, formatList, formatKeyValue } from "./section.ts";

// Code formatting
export { formatInlineCode, formatCodeBlock } from "./code.ts";

// Project formatting
export { formatProjectHeader, formatEmptyState } from "./project.ts";

// Fix suggestions formatting
export { formatFixSuggestions } from "./suggestions.ts";

// Re-export the QualityGateInfo interface for backwards compatibility
export interface QualityGateInfo {
  status: import("../../types/index.ts").QualityGateStatus;
  isOk: boolean;
}
