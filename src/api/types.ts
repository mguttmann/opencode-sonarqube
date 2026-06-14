/**
 * Shared API Response Types
 * Consolidates common interfaces used across SonarQube API modules
 */

// =============================================================================
// Common Pagination
// =============================================================================

/**
 * Common pagination response structure
 */
export interface PagingResponse {
  pageIndex: number;
  pageSize: number;
  total: number;
}

// =============================================================================
// Metrics Types
// =============================================================================

/**
 * Metric definition from SonarQube
 */
export interface MetricDefinition {
  key: string;
  name: string;
  description?: string;
  domain?: string;
  type: string;
  direction?: number;
  qualitative?: boolean;
  hidden?: boolean;
  custom?: boolean;
}

/**
 * Component measure value
 */
export interface ComponentMeasure {
  metric: string;
  value?: string;
  bestValue?: boolean;
  period?: {
    value: string;
    bestValue?: boolean;
  };
}

/**
 * Component with associated measures
 */
export interface ComponentWithMeasures {
  key: string;
  name: string;
  qualifier: string;
  measures: ComponentMeasure[];
}

// =============================================================================
// Branch Types
// =============================================================================

/**
 * Branch quality gate status
 */
export interface BranchStatus {
  qualityGateStatus: "OK" | "WARN" | "ERROR" | "NONE";
  bugs?: number;
  vulnerabilities?: number;
  codeSmells?: number;
}

/**
 * Branch information
 */
export interface Branch {
  name: string;
  isMain: boolean;
  type: "BRANCH" | "PULL_REQUEST";
  status?: BranchStatus;
  analysisDate?: string;
  excludedFromPurge?: boolean;
}

// =============================================================================
// Quality Profile Types
// =============================================================================

/**
 * Quality profile information
 */
export interface QualityProfile {
  key: string;
  name: string;
  language: string;
  languageName: string;
  isInherited: boolean;
  isBuiltIn: boolean;
  isDefault: boolean;
  activeRuleCount: number;
  activeDeprecatedRuleCount: number;
  rulesUpdatedAt?: string;
  lastUsed?: string;
  userUpdatedAt?: string;
}

/**
 * Profile inheritance information
 */
export interface ProfileInheritance {
  profile: {
    key: string;
    name: string;
    activeRuleCount: number;
    overridingRuleCount?: number;
  };
  ancestors: Array<{
    key: string;
    name: string;
    activeRuleCount: number;
  }>;
  children: Array<{
    key: string;
    name: string;
    activeRuleCount: number;
    overridingRuleCount: number;
  }>;
}

// =============================================================================
// Analysis Types
// =============================================================================

/**
 * Analysis event from SonarQube
 */
export interface AnalysisEvent {
  key: string;
  category: string;
  name: string;
  description?: string;
}

/**
 * Project analysis record
 */
export interface ProjectAnalysis {
  key: string;
  date: string;
  projectVersion?: string;
  buildString?: string;
  revision?: string;
  manualNewCodePeriodBaseline?: boolean;
  events: AnalysisEvent[];
}

// =============================================================================
// Compute Engine (CE) Task Types
// =============================================================================

/**
 * Analysis task status
 */
export type TaskStatus = "PENDING" | "IN_PROGRESS" | "SUCCESS" | "FAILED" | "CANCELED";

/**
 * Analysis task from CE API
 */
export interface AnalysisTask {
  id: string;
  type: string;
  componentKey: string;
  componentName: string;
  status: TaskStatus;
  submittedAt: string;
  startedAt?: string;
  executedAt?: string;
  executionTimeMs?: number;
  errorMessage?: string;
  errorType?: string;
  analysisId?: string;
}
