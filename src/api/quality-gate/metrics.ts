/**
 * SonarQube Metric Keys and Helpers
 * Defines metric constants and helper functions for formatting metrics
 */

/**
 * Metric keys commonly used for quality assessment
 */
export const METRIC_KEYS = {
  // Coverage
  coverage: "coverage",
  newCoverage: "new_coverage",
  lineCoverage: "line_coverage",
  branchCoverage: "branch_coverage",

  // Duplications
  duplicatedLines: "duplicated_lines",
  duplicatedLinesDensity: "duplicated_lines_density",
  duplicatedBlocks: "duplicated_blocks",

  // Issues
  bugs: "bugs",
  newBugs: "new_bugs",
  vulnerabilities: "vulnerabilities",
  newVulnerabilities: "new_vulnerabilities",
  codeSmells: "code_smells",
  newCodeSmells: "new_code_smells",
  securityHotspots: "security_hotspots",
  newSecurityHotspots: "new_security_hotspots",

  // Ratings
  reliabilityRating: "reliability_rating",
  securityRating: "security_rating",
  sqaleRating: "sqale_rating", // Maintainability
  securityReviewRating: "security_review_rating",

  // Size
  ncloc: "ncloc", // Lines of code
  lines: "lines",
  files: "files",
  classes: "classes",
  functions: "functions",

  // Complexity
  complexity: "complexity",
  cognitiveComplexity: "cognitive_complexity",
} as const;

/**
 * Metric key to human-readable name mapping
 */
export const METRIC_NAMES: Record<string, string> = {
  coverage: "Coverage",
  new_coverage: "Coverage on New Code",
  duplicated_lines_density: "Duplicated Lines (%)",
  bugs: "Bugs",
  new_bugs: "New Bugs",
  vulnerabilities: "Vulnerabilities",
  new_vulnerabilities: "New Vulnerabilities",
  code_smells: "Code Smells",
  new_code_smells: "New Code Smells",
  security_hotspots: "Security Hotspots",
  reliability_rating: "Reliability Rating",
  security_rating: "Security Rating",
  sqale_rating: "Maintainability Rating",
  security_review_rating: "Security Review Rating",
};

/**
 * Comparator symbol mapping
 */
export const COMPARATOR_SYMBOLS: Record<string, string> = {
  GT: ">",
  LT: "<",
  EQ: "=",
  NE: "!=",
};

/**
 * Format metric key to human-readable name
 */
export function formatMetricName(metricKey: string): string {
  return METRIC_NAMES[metricKey] ?? metricKey;
}

/**
 * Format comparator symbol
 */
export function formatComparator(comparator: string): string {
  return COMPARATOR_SYMBOLS[comparator] ?? comparator;
}

/**
 * Convert rating number (1-5) to letter (A-E)
 */
export function getRatingLetter(value: string | undefined): string {
  if (!value) return "?";
  const ratings = ["A", "B", "C", "D", "E"];
  const index = Number.parseInt(value, 10) - 1;
  return ratings[index] ?? "?";
}
