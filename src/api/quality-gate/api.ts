/**
 * SonarQube Quality Gate API
 * Handles quality gate status and metrics
 */

import type { SonarQubeClient } from "../client.ts";
import type {
  QualityGateStatusResponse,
  MeasuresResponse,
  QualityGateStatus,
  EnterpriseValidationResult,
  AnalysisLevel,
} from "../../types/index.ts";
import { getThresholdsForLevel } from "../../types/index.ts";
import { Logger } from "../../utils/logger.ts";
import { BaseAPI } from "../base-api.ts";
import { METRIC_KEYS, formatMetricName, formatComparator, getRatingLetter } from "./metrics.ts";
import { runEnterpriseChecks, formatEnterpriseValidation, type QualityMetrics } from "./enterprise-validation.ts";

export class QualityGateAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-quality-gate", logger);
  }

  /**
   * Get the quality gate status for a project
   */
  async getStatus(
    projectKey: string,
    branch?: string
  ): Promise<QualityGateStatusResponse> {
    this.logger.debug(`Getting quality gate status for: ${projectKey}`);

    return this.client.get<QualityGateStatusResponse>(
      "/api/qualitygates/project_status",
      {
        projectKey,
        branch,
      }
    );
  }

  /**
   * Check if quality gate passed
   */
  async isPassing(projectKey: string, branch?: string): Promise<boolean> {
    const status = await this.getStatus(projectKey, branch);
    return status.projectStatus.status === "OK";
  }

  /**
   * Get failed conditions from quality gate
   */
  async getFailedConditions(
    projectKey: string,
    branch?: string
  ): Promise<QualityGateStatusResponse["projectStatus"]["conditions"]> {
    const status = await this.getStatus(projectKey, branch);
    return status.projectStatus.conditions.filter((c) => c.status !== "OK");
  }

  /**
   * Get project measures/metrics
   */
  async getMeasures(
    projectKey: string,
    metricKeys: string[]
  ): Promise<MeasuresResponse> {
    return this.client.get<MeasuresResponse>("/api/measures/component", {
      component: projectKey,
      metricKeys: metricKeys.join(","),
    });
  }

  /**
   * Get common quality metrics
   */
  async getQualityMetrics(projectKey: string): Promise<QualityMetrics> {
    const metricKeys = [
      METRIC_KEYS.coverage,
      METRIC_KEYS.duplicatedLinesDensity,
      METRIC_KEYS.bugs,
      METRIC_KEYS.vulnerabilities,
      METRIC_KEYS.codeSmells,
      METRIC_KEYS.securityHotspots,
      METRIC_KEYS.reliabilityRating,
      METRIC_KEYS.securityRating,
      METRIC_KEYS.sqaleRating,
      METRIC_KEYS.ncloc,
    ];

    const response = await this.getMeasures(projectKey, metricKeys);

    const getValue = (metric: string): string | undefined => {
      const measure = response.component.measures.find((m) => m.metric === metric);
      return measure?.value;
    };

    const getNumericValue = (metric: string): number => {
      const value = getValue(metric);
      return value ? Number.parseFloat(value) : 0;
    };

    return {
      coverage: getValue(METRIC_KEYS.coverage)
        ? Number.parseFloat(getValue(METRIC_KEYS.coverage)!)
        : undefined,
      duplications: getValue(METRIC_KEYS.duplicatedLinesDensity)
        ? Number.parseFloat(getValue(METRIC_KEYS.duplicatedLinesDensity)!)
        : undefined,
      bugs: getNumericValue(METRIC_KEYS.bugs),
      vulnerabilities: getNumericValue(METRIC_KEYS.vulnerabilities),
      codeSmells: getNumericValue(METRIC_KEYS.codeSmells),
      securityHotspots: getNumericValue(METRIC_KEYS.securityHotspots),
      reliabilityRating: getRatingLetter(getValue(METRIC_KEYS.reliabilityRating)),
      securityRating: getRatingLetter(getValue(METRIC_KEYS.securityRating)),
      maintainabilityRating: getRatingLetter(getValue(METRIC_KEYS.sqaleRating)),
      linesOfCode: getNumericValue(METRIC_KEYS.ncloc),
    };
  }

  /**
   * Format quality gate status for display
   */
  formatStatus(response: QualityGateStatusResponse): string {
    const { status, conditions } = response.projectStatus;

    const lines: string[] = [
      `## Quality Gate: ${this.formatStatusEmoji(status)} ${status}`,
      "",
    ];

    if (conditions.length === 0) {
      lines.push("No conditions evaluated.");
      return lines.join("\n");
    }

    // Group conditions by status
    const failed = conditions.filter((c) => c.status === "ERROR");
    const warned = conditions.filter((c) => c.status === "WARN");
    const passed = conditions.filter((c) => c.status === "OK");

    if (failed.length > 0) {
      lines.push(
        "### Failed Conditions",
        ...failed.map((condition) => this.formatCondition(condition)),
        ""
      );
    }

    if (warned.length > 0) {
      lines.push(
        "### Warning Conditions",
        ...warned.map((condition) => this.formatCondition(condition)),
        ""
      );
    }

    if (passed.length > 0 && (failed.length > 0 || warned.length > 0)) {
      lines.push(`### Passed Conditions (${passed.length})`);
      // Just show count to keep output concise
    }

    return lines.join("\n");
  }

  /**
   * Format a single condition for display
   */
  private formatCondition(
    condition: QualityGateStatusResponse["projectStatus"]["conditions"][0]
  ): string {
    const metric = formatMetricName(condition.metricKey);
    const actual = condition.actualValue ?? "N/A";
    const threshold = condition.errorThreshold ?? "N/A";
    const comparator = formatComparator(condition.comparator);

    return `- **${metric}**: ${actual} (threshold: ${comparator} ${threshold})`;
  }

  /**
   * Get status indicator (text-based, no emoji)
   */
  private formatStatusEmoji(status: QualityGateStatus): string {
    switch (status) {
      case "OK":
        return "[PASS]";
      case "WARN":
        return "[WARN]";
      case "ERROR":
        return "[FAIL]";
      default:
        return "[?]";
    }
  }

  /**
   * Validate project against enterprise quality thresholds
   * This is the main method for checking if a project meets enterprise standards
   */
  async validateEnterpriseQuality(
    projectKey: string,
    level: AnalysisLevel = "enterprise"
  ): Promise<EnterpriseValidationResult> {
    this.logger.info(`Validating enterprise quality for: ${projectKey}`, { level });

    const thresholds = getThresholdsForLevel(level);
    
    if (!thresholds) {
      return {
        passed: true,
        projectKey,
        level,
        summary: "Quality validation disabled (level: off)",
        checks: [],
        metrics: {
          coverage: undefined,
          duplications: undefined,
          bugs: 0,
          vulnerabilities: 0,
          codeSmells: 0,
          securityHotspots: 0,
          reliabilityRating: "?",
          securityRating: "?",
          maintainabilityRating: "?",
          linesOfCode: 0,
        },
        timestamp: new Date().toISOString(),
      };
    }

    // Get current metrics
    const metrics = await this.getQualityMetrics(projectKey);
    
    // Run all checks
    const checks = runEnterpriseChecks(metrics, thresholds);
    
    // Determine overall pass/fail
    const passed = checks.every(check => check.passed);
    
    // Generate summary
    const failedCount = checks.filter(c => !c.passed).length;
    const summary = passed
      ? `All ${checks.length} enterprise quality checks passed`
      : `${failedCount} of ${checks.length} enterprise quality checks failed`;

    return {
      passed,
      projectKey,
      level,
      summary,
      checks,
      metrics,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Format enterprise validation result for display
   */
  formatEnterpriseValidation(result: EnterpriseValidationResult): string {
    return formatEnterpriseValidation(result);
  }
}
