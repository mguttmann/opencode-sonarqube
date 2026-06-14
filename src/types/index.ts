/**
 * SonarQube Plugin Types
 * Enterprise-level type definitions for the OpenCode SonarQube integration
 */

import { z } from "zod";

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Analysis level determines how strict the quality checks are
 */
export type AnalysisLevel = "enterprise" | "standard" | "relaxed" | "off";

/**
 * Issue severity levels from SonarQube
 */
export type IssueSeverity =
  | "BLOCKER"
  | "CRITICAL"
  | "MAJOR"
  | "MINOR"
  | "INFO";

/**
 * Issue types from SonarQube
 */
export type IssueType = "BUG" | "VULNERABILITY" | "CODE_SMELL" | "SECURITY_HOTSPOT";

/**
 * Quality Gate status
 */
export type QualityGateStatus = "OK" | "WARN" | "ERROR" | "NONE";

/**
 * New code definition strategies
 */
export type NewCodeDefinition =
  | "previous_version"
  | "number_of_days"
  | "reference_branch"
  | "specific_analysis";

// =============================================================================
// CONFIGURATION SCHEMA
// =============================================================================

export const SonarQubeConfigSchema = z.object({
  /** SonarQube server URL */
  url: z.string().url().describe("SonarQube server URL"),

  /** SonarQube username (admin or user with project creation rights) */
  user: z.string().min(1).describe("SonarQube username"),

  /** SonarQube password */
  password: z.string().min(1).describe("SonarQube password"),

  /** Analysis strictness level */
  level: z
    .enum(["enterprise", "standard", "relaxed", "off"])
    .default("enterprise")
    .describe("Analysis strictness level"),

  /** Automatically analyze on session.idle */
  autoAnalyze: z
    .boolean()
    .default(true)
    .describe("Auto-analyze when agent becomes idle"),

  /** Project key (defaults to package.json name or directory name) */
  projectKey: z
    .string()
    .optional()
    .describe("SonarQube project key (auto-generated if not set)"),

  /** Project name */
  projectName: z
    .string()
    .optional()
    .describe("SonarQube project display name"),

  /** Quality gate name (auto-selected based on level if not set) */
  qualityGate: z
    .string()
    .optional()
    .describe("Quality gate to use"),

  /** New code definition */
  newCodeDefinition: z
    .enum(["previous_version", "number_of_days", "reference_branch", "specific_analysis"])
    .default("previous_version")
    .describe("How to define 'new code' for analysis"),

  /** Source directories (comma-separated, auto-detected if not set) */
  sources: z
    .string()
    .optional()
    .describe("Source directories to analyze (auto-detected if not set)"),

  /** Test directories (comma-separated) */
  tests: z
    .string()
    .optional()
    .describe("Test directories"),

  /** File exclusions (glob patterns) */
  exclusions: z
    .string()
    .optional()
    .describe("File exclusion patterns"),
});

export type SonarQubeConfig = z.infer<typeof SonarQubeConfigSchema>;

/**
 * Local project state stored in .sonarqube/project.json
 * This contains project-specific settings that are auto-generated
 */
export const ProjectStateSchema = z.object({
  /** Project key on SonarQube server */
  projectKey: z.string(),

  /** Project analysis token (auto-generated) */
  projectToken: z.string(),

  /** Token name for identification */
  tokenName: z.string(),

  /** When the project was initialized */
  initializedAt: z.string(),

  /** Last analysis timestamp */
  lastAnalysis: z.string().optional(),

  /** Detected languages */
  languages: z.array(z.string()),

  /** Quality gate in use */
  qualityGate: z.string().optional(),

  /** Whether setup is complete */
  setupComplete: z.boolean(),
});

export type ProjectState = z.infer<typeof ProjectStateSchema>;

// =============================================================================
// BOOTSTRAP TYPES
// =============================================================================

/**
 * Bootstrap result after first-run setup
 */
export interface BootstrapResult {
  success: boolean;
  projectKey: string;
  projectToken?: string;
  qualityGate?: string;
  languages: string[];
  message: string;
  isNewProject: boolean;
}

/**
 * Quality gate configuration based on analysis level
 */
export interface QualityGateConfig {
  name: string;
  conditions: Array<{
    metric: string;
    op: "GT" | "LT";
    error: string;
  }>;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * SonarQube server status response
 */
export interface ServerStatus {
  id: string;
  version: string;
  status: "UP" | "DOWN" | "STARTING" | "RESTARTING";
}

/**
 * Authentication validation response
 */
export interface AuthValidation {
  valid: boolean;
}

/**
 * Project creation response
 */
export interface ProjectCreateResponse {
  project: {
    key: string;
    name: string;
    qualifier: string;
  };
}

/**
 * Project search response
 */
export interface ProjectSearchResponse {
  paging: {
    pageIndex: number;
    pageSize: number;
    total: number;
  };
  components: Array<{
    key: string;
    name: string;
    qualifier: string;
    visibility: string;
    lastAnalysisDate?: string;
  }>;
}

/**
 * Token generation response
 */
export interface TokenGenerateResponse {
  login: string;
  name: string;
  token: string;
  type: string;
  createdAt?: string;
  expirationDate?: string;
}

/**
 * Quality gates list response
 */
export interface QualityGatesListResponse {
  qualitygates: Array<{
    id: number;
    name: string;
    isDefault?: boolean;
    isBuiltIn?: boolean;
  }>;
  default?: number;
}

/**
 * Single issue from SonarQube
 */
export interface SonarQubeIssue {
  key: string;
  rule: string;
  severity: IssueSeverity;
  component: string;
  project: string;
  line?: number;
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  flows: Array<{
    locations: Array<{
      component: string;
      textRange?: {
        startLine: number;
        endLine: number;
        startOffset: number;
        endOffset: number;
      };
      msg: string;
    }>;
  }>;
  status: string;
  message: string;
  effort?: string;
  debt?: string;
  author?: string;
  tags: string[];
  creationDate: string;
  updateDate: string;
  type: IssueType;
  scope: string;
  quickFixAvailable?: boolean;
}

/**
 * Issues search response
 */
export interface IssuesSearchResponse {
  total: number;
  p: number;
  ps: number;
  paging: {
    pageIndex: number;
    pageSize: number;
    total: number;
  };
  issues: SonarQubeIssue[];
  components: Array<{
    key: string;
    enabled?: boolean;
    qualifier: string;
    name: string;
    longName: string;
    path?: string;
  }>;
  rules: Array<{
    key: string;
    name: string;
    lang?: string;
    status: string;
    langName?: string;
  }>;
}

/**
 * Quality gate condition
 */
export interface QualityGateCondition {
  status: QualityGateStatus;
  metricKey: string;
  comparator: string;
  periodIndex?: number;
  errorThreshold?: string;
  actualValue?: string;
}

/**
 * Quality gate project status response
 */
export interface QualityGateStatusResponse {
  projectStatus: {
    status: QualityGateStatus;
    conditions: QualityGateCondition[];
    periods?: Array<{
      index: number;
      mode: string;
      date: string;
      parameter?: string;
    }>;
    ignoredConditions?: boolean;
  };
}

/**
 * Measures/metrics response
 */
export interface MeasuresResponse {
  component: {
    key: string;
    name: string;
    qualifier: string;
    measures: Array<{
      metric: string;
      value?: string;
      period?: {
        value: string;
        bestValue?: boolean;
      };
    }>;
  };
}

// =============================================================================
// PLUGIN INTERNAL TYPES
// =============================================================================

/**
 * Formatted issue for agent consumption
 */
export interface FormattedIssue {
  key: string;
  severity: IssueSeverity;
  type: IssueType;
  rule: string;
  message: string;
  file: string;
  line?: number;
  effort?: string;
  quickFixAvailable: boolean;
}

/**
 * Analysis result summary
 */
export interface AnalysisResult {
  success: boolean;
  qualityGateStatus: QualityGateStatus;
  issues: {
    total: number;
    blocker: number;
    critical: number;
    major: number;
    minor: number;
    info: number;
  };
  metrics: {
    coverage?: number;
    duplications?: number;
    codeSmells?: number;
    bugs?: number;
    vulnerabilities?: number;
    securityHotspots?: number;
  };
  formattedIssues: FormattedIssue[];
  timestamp: string;
}

/**
 * Scanner execution options
 */
export interface ScannerOptions {
  projectKey: string;
  projectName?: string;
  sources?: string;
  tests?: string;
  exclusions?: string;
  additionalProperties?: Record<string, string>;
  pullRequest?: {
    key: string;
    branch: string;
    base: string;
  };
  branch?: string;
}

// =============================================================================
// ENTERPRISE QUALITY VALIDATION TYPES
// =============================================================================

/**
 * Enterprise quality thresholds configuration
 */
export interface EnterpriseQualityThresholds {
  /** Minimum coverage percentage (0-100) */
  minCoverage: number;
  /** Maximum duplication percentage (0-100) */
  maxDuplications: number;
  /** Maximum allowed bugs (0 for enterprise) */
  maxBugs: number;
  /** Maximum allowed vulnerabilities (0 for enterprise) */
  maxVulnerabilities: number;
  /** Maximum allowed code smells (0 for enterprise) */
  maxCodeSmells: number;
  /** Maximum allowed security hotspots (0 for enterprise) */
  maxSecurityHotspots: number;
  /** Required reliability rating (A=1, B=2, C=3, D=4, E=5) */
  minReliabilityRating: number;
  /** Required security rating (A=1, B=2, C=3, D=4, E=5) */
  minSecurityRating: number;
  /** Required maintainability rating (A=1, B=2, C=3, D=4, E=5) */
  minMaintainabilityRating: number;
}

/**
 * Default enterprise thresholds - strictest level
 */
export const ENTERPRISE_THRESHOLDS: EnterpriseQualityThresholds = {
  minCoverage: 80,
  maxDuplications: 0,
  maxBugs: 0,
  maxVulnerabilities: 0,
  maxCodeSmells: 0,
  maxSecurityHotspots: 0,
  minReliabilityRating: 1, // A
  minSecurityRating: 1, // A
  minMaintainabilityRating: 1, // A
};

/**
 * Standard quality thresholds
 */
export const STANDARD_THRESHOLDS: EnterpriseQualityThresholds = {
  minCoverage: 70,
  maxDuplications: 3,
  maxBugs: 0,
  maxVulnerabilities: 0,
  maxCodeSmells: 10,
  maxSecurityHotspots: 0,
  minReliabilityRating: 2, // B
  minSecurityRating: 1, // A
  minMaintainabilityRating: 2, // B
};

/**
 * Relaxed quality thresholds
 */
export const RELAXED_THRESHOLDS: EnterpriseQualityThresholds = {
  minCoverage: 50,
  maxDuplications: 5,
  maxBugs: 5,
  maxVulnerabilities: 0,
  maxCodeSmells: 50,
  maxSecurityHotspots: 5,
  minReliabilityRating: 3, // C
  minSecurityRating: 2, // B
  minMaintainabilityRating: 3, // C
};

/**
 * Individual validation check result
 */
export interface QualityCheckResult {
  name: string;
  passed: boolean;
  actual: string | number;
  expected: string | number;
  message: string;
}

/**
 * Complete enterprise quality validation result
 */
export interface EnterpriseValidationResult {
  /** Overall pass/fail */
  passed: boolean;
  /** Project key */
  projectKey: string;
  /** Validation level used */
  level: AnalysisLevel;
  /** Summary message */
  summary: string;
  /** Individual check results */
  checks: QualityCheckResult[];
  /** Metrics at time of validation */
  metrics: {
    coverage?: number;
    duplications?: number;
    bugs: number;
    vulnerabilities: number;
    codeSmells: number;
    securityHotspots: number;
    reliabilityRating: string;
    securityRating: string;
    maintainabilityRating: string;
    linesOfCode: number;
  };
  /** Timestamp of validation */
  timestamp: string;
}

/**
 * Get thresholds for a given analysis level
 */
export function getThresholdsForLevel(level: AnalysisLevel): EnterpriseQualityThresholds | null {
  switch (level) {
    case "enterprise":
      return ENTERPRISE_THRESHOLDS;
    case "standard":
      return STANDARD_THRESHOLDS;
    case "relaxed":
      return RELAXED_THRESHOLDS;
    case "off":
      return null;
  }
}

/**
 * Convert rating letter to number (A=1, B=2, etc.)
 */
export function ratingToNumber(rating: string): number {
  const map: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };
  return map[rating.toUpperCase()] ?? 5;
}

/**
 * Convert rating number to letter (1=A, 2=B, etc.)
 */
export function numberToRating(num: number): string {
  const ratings = ["A", "B", "C", "D", "E"];
  return ratings[num - 1] ?? "?";
}

// =============================================================================
// ERROR TYPES
// =============================================================================

// Error interface for type checking
export interface SonarQubeErrorType extends Error {
  code: string;
  statusCode?: number;
}

// Factory functions instead of classes (avoids Bun bundling issues with ES6 class inheritance)

/**
 * Create a SonarQube error with consistent structure
 */
function createSonarQubeError(
  name: string,
  message: string,
  code: string,
  statusCode?: number
): SonarQubeErrorType {
  const error = new Error(message) as SonarQubeErrorType;
  error.name = name;
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function SonarQubeError(message: string, code: string, statusCode?: number): SonarQubeErrorType {
  return createSonarQubeError("SonarQubeError", message, code, statusCode);
}

export function ConnectionError(message: string): SonarQubeErrorType {
  return createSonarQubeError("ConnectionError", message, "CONNECTION_ERROR");
}

export function AuthenticationError(message: string): SonarQubeErrorType {
  return createSonarQubeError("AuthenticationError", message, "AUTH_ERROR", 401);
}

export function ProjectNotFoundError(projectKey: string): SonarQubeErrorType {
  return createSonarQubeError("ProjectNotFoundError", `Project '${projectKey}' not found`, "PROJECT_NOT_FOUND", 404);
}

export function RateLimitError(retryAfter?: number): SonarQubeErrorType {
  const hasRetryAfter = retryAfter !== undefined && retryAfter > 0;
  const retryMessage = hasRetryAfter ? `. Retry after ${retryAfter}s` : "";
  return createSonarQubeError("RateLimitError", `Rate limit exceeded${retryMessage}`, "RATE_LIMIT", 429);
}

export function SetupError(message: string): SonarQubeErrorType {
  return createSonarQubeError("SetupError", message, "SETUP_ERROR");
}

// =============================================================================
// SECURITY HOTSPOT TYPES
// =============================================================================

/**
 * Vulnerability probability levels for security hotspots
 */
export type VulnerabilityProbability = "HIGH" | "MEDIUM" | "LOW";

/**
 * Security hotspot status
 */
export type HotspotStatus = "TO_REVIEW" | "REVIEWED" | "SAFE" | "FIXED";

/**
 * Security hotspot from SonarQube
 */
export interface SecurityHotspot {
  key: string;
  component: string;
  project: string;
  securityCategory: string;
  vulnerabilityProbability: VulnerabilityProbability;
  status: HotspotStatus;
  line?: number;
  message: string;
  author?: string;
  creationDate: string;
  updateDate: string;
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
}

/**
 * Security hotspots search response
 */
export interface HotspotsSearchResponse {
  paging: {
    pageIndex: number;
    pageSize: number;
    total: number;
  };
  hotspots: SecurityHotspot[];
  components: Array<{
    key: string;
    qualifier: string;
    name: string;
    longName: string;
    path?: string;
  }>;
}
