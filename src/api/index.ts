/**
 * SonarQube API Module Exports
 */

export { BaseAPI } from "./base-api.ts";
export {
  SonarQubeClient,
  createClientWithToken,
  createClientWithCredentials,
  type AuthConfig,
  type ClientConfig,
} from "./client.ts";
export { ProjectsAPI } from "./projects.ts";
export { IssuesAPI } from "./issues.ts";
export { QualityGateAPI, METRIC_KEYS } from "./quality-gate.ts";
export { RulesAPI, type RuleDetails } from "./rules.ts";
export { SourcesAPI, type SourceLine, type SourceSnippet, type IssueWithContext } from "./sources.ts";
export { DuplicationsAPI, type FormattedDuplication } from "./duplications.ts";
export { ComputeEngineAPI, type AnalysisTask, type TaskStatus } from "./ce.ts";
export { ProjectAnalysesAPI, type ProjectAnalysis, type AnalysisEvent } from "./analyses.ts";
export { QualityProfilesAPI, type QualityProfile, type ProfileInheritance } from "./profiles.ts";
export { BranchesAPI, type Branch, type BranchStatus } from "./branches.ts";
export { MetricsAPI, type MetricDefinition, type ComponentMeasure, COMMON_METRICS } from "./metrics.ts";
export { ComponentsAPI, type FileIssueSummary } from "./components.ts";

import type { SonarQubeConfig, ProjectState } from "../types/index.ts";
import { SonarQubeClient, createClientWithToken, createClientWithCredentials } from "./client.ts";
import { ProjectsAPI } from "./projects.ts";
import { IssuesAPI } from "./issues.ts";
import { QualityGateAPI } from "./quality-gate.ts";
import { RulesAPI } from "./rules.ts";
import { SourcesAPI } from "./sources.ts";
import { DuplicationsAPI } from "./duplications.ts";
import { ComputeEngineAPI } from "./ce.ts";
import { ProjectAnalysesAPI } from "./analyses.ts";
import { QualityProfilesAPI } from "./profiles.ts";
import { BranchesAPI } from "./branches.ts";
import { MetricsAPI } from "./metrics.ts";
import { ComponentsAPI } from "./components.ts";
import { Logger } from "../utils/logger.ts";

/**
 * Complete SonarQube API wrapper
 * Provides access to all API modules
 */
export class SonarQubeAPI {
  public readonly client: SonarQubeClient;
  public readonly projects: ProjectsAPI;
  public readonly issues: IssuesAPI;
  public readonly qualityGate: QualityGateAPI;
  public readonly rules: RulesAPI;
  public readonly sources: SourcesAPI;
  public readonly duplications: DuplicationsAPI;
  public readonly ce: ComputeEngineAPI;
  public readonly analyses: ProjectAnalysesAPI;
  public readonly profiles: QualityProfilesAPI;
  public readonly branches: BranchesAPI;
  public readonly metrics: MetricsAPI;
  public readonly components: ComponentsAPI;

  private readonly logger: Logger;

  constructor(client: SonarQubeClient, logger?: Logger) {
    this.logger = logger ?? new Logger("sonarqube-api");
    this.client = client;
    this.projects = new ProjectsAPI(client, this.logger.child("projects"));
    this.issues = new IssuesAPI(client, this.logger.child("issues"));
    this.qualityGate = new QualityGateAPI(client, this.logger.child("quality-gate"));
    this.rules = new RulesAPI(client, this.logger.child("rules"));
    this.sources = new SourcesAPI(client, this.logger.child("sources"));
    this.duplications = new DuplicationsAPI(client, this.logger.child("duplications"));
    this.ce = new ComputeEngineAPI(client, this.logger.child("ce"));
    this.analyses = new ProjectAnalysesAPI(client, this.logger.child("analyses"));
    this.profiles = new QualityProfilesAPI(client, this.logger.child("profiles"));
    this.branches = new BranchesAPI(client, this.logger.child("branches"));
    this.metrics = new MetricsAPI(client, this.logger.child("metrics"));
    this.components = new ComponentsAPI(client, this.logger.child("components"));
  }

  /**
   * Perform a health check on the SonarQube server
   */
  async healthCheck(): Promise<{ healthy: boolean; version?: string; error?: string }> {
    return this.client.healthCheck();
  }

  /**
   * Get a complete analysis summary for a project
   */
  async getAnalysisSummary(projectKey: string): Promise<{
    qualityGate: {
      status: string;
      passed: boolean;
      failedConditions: number;
    };
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
      bugs: number;
      vulnerabilities: number;
      codeSmells: number;
      securityHotspots: number;
      reliabilityRating: string;
      securityRating: string;
      maintainabilityRating: string;
      linesOfCode: number;
    };
  }> {
    const [qgStatus, issueCounts, metrics] = await Promise.all([
      this.qualityGate.getStatus(projectKey),
      this.issues.getCounts(projectKey),
      this.qualityGate.getQualityMetrics(projectKey),
    ]);

    const failedConditions = qgStatus.projectStatus.conditions.filter(
      (c) => c.status !== "OK"
    ).length;

    return {
      qualityGate: {
        status: qgStatus.projectStatus.status,
        passed: qgStatus.projectStatus.status === "OK",
        failedConditions,
      },
      issues: issueCounts,
      metrics,
    };
  }
}

/**
 * Create a SonarQube API instance with user/password credentials
 * Used during bootstrap and setup
 */
export function createSonarQubeAPIWithCredentials(
  url: string,
  user: string,
  password: string,
  logger?: Logger
): SonarQubeAPI {
  const client = createClientWithCredentials(url, user, password, logger?.child("client"));
  return new SonarQubeAPI(client, logger);
}

/**
 * Create a SonarQube API instance with project token
 * Used for regular operations after bootstrap
 */
export function createSonarQubeAPIWithToken(
  url: string,
  token: string,
  logger?: Logger
): SonarQubeAPI {
  const client = createClientWithToken(url, token, logger?.child("client"));
  return new SonarQubeAPI(client, logger);
}

/**
 * Create a SonarQube API instance from config and project state
 * This is the recommended way to create an API instance for regular operations
 */
export function createSonarQubeAPI(
  config: SonarQubeConfig,
  state: ProjectState,
  logger?: Logger
): SonarQubeAPI {
  // NOTE: No console.log here - it breaks the TUI!
  return createSonarQubeAPIWithToken(config.url, state.projectToken, logger);
}
