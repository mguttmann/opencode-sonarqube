/**
 * SonarQube Metrics API
 * Provides access to detailed code metrics
 */

import type { SonarQubeClient } from "./client.ts";
import { Logger } from "../utils/logger.ts";
import { BaseAPI } from "./base-api.ts";
import { API } from "../constants.ts";
import { MetricFormatter } from "../utils/metric-formatter.ts";
import type { MetricDefinition, ComponentMeasure, ComponentWithMeasures } from "./types.ts";

// Re-export types for backwards compatibility
export type { MetricDefinition, ComponentMeasure, ComponentWithMeasures } from "./types.ts";

/**
 * Measures response
 */
interface MeasuresResponse {
  component: ComponentWithMeasures;
}

/**
 * Metrics list response
 */
interface MetricsListResponse {
  metrics: MetricDefinition[];
  total: number;
}

/**
 * Common metric keys for code quality
 */
export const COMMON_METRICS = [
  // Size
  "ncloc",
  "lines",
  "statements",
  "functions",
  "classes",
  "files",
  // Complexity
  "complexity",
  "cognitive_complexity",
  // Issues
  "bugs",
  "vulnerabilities",
  "code_smells",
  "security_hotspots",
  // Ratings
  "reliability_rating",
  "security_rating",
  "sqale_rating",
  "security_review_rating",
  // Coverage
  "coverage",
  "line_coverage",
  "branch_coverage",
  "uncovered_lines",
  "uncovered_conditions",
  // Duplications
  "duplicated_lines_density",
  "duplicated_blocks",
  "duplicated_files",
  // Technical Debt
  "sqale_index",
  "sqale_debt_ratio",
] as const;

export class MetricsAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-metrics", logger);
  }

  /**
   * Get all available metric definitions
   */
  async getMetricDefinitions(): Promise<MetricDefinition[]> {
    this.logger.debug("Getting metric definitions");

    return this.safeRequest(
      async () => {
        const response = await this.client.get<MetricsListResponse>(
          "/api/metrics/search",
          { ps: API.DEFAULT_PAGE_SIZE }
        );
        return response.metrics;
      },
      [],
      "Failed to get metric definitions"
    );
  }

  /**
   * Get measures for a component
   * @param options.componentKey - The component (project) key
   * @param options.metricKeys - Metric keys to retrieve (defaults to COMMON_METRICS)
   * @param options.branch - Branch name (not available in Community Edition)
   */
  async getMeasures(options: {
    componentKey: string;
    metricKeys?: string[];
    branch?: string;
  }): Promise<ComponentMeasure[]> {
    const metrics = options.metricKeys ?? [...COMMON_METRICS];
    this.logger.debug(`Getting measures for ${options.componentKey}`);

    return this.safeRequest(
      async () => {
        const response = await this.client.get<MeasuresResponse>(
          "/api/measures/component",
          {
            component: options.componentKey,
            metricKeys: metrics.join(","),
            branch: options.branch,
          }
        );
        return response.component.measures;
      },
      [],
      `Failed to get measures for ${options.componentKey}`
    );
  }

  /**
   * Get measures with period comparison (new code)
   */
  async getMeasuresWithPeriod(options: {
    componentKey: string;
    metricKeys?: string[];
    branch?: string;
  }): Promise<ComponentMeasure[]> {
    const metrics = options.metricKeys ?? [...COMMON_METRICS];
    this.logger.debug(`Getting measures with period for ${options.componentKey}`);

    try {
      const response = await this.client.get<MeasuresResponse>(
        "/api/measures/component",
        {
          component: options.componentKey,
          metricKeys: metrics.join(","),
          branch: options.branch,
          additionalFields: "period",
        }
      );
      return response.component.measures;
    } catch (error) {
      this.logger.warn(`Failed to get measures: ${error}`);
      return [];
    }
  }

  /**
   * Format measures for agent display
   */
  formatMeasuresForAgent(measures: ComponentMeasure[]): string {
    if (measures.length === 0) {
      return "No metrics available.";
    }

    const lines = ["## Code Metrics", ""];

    // Group metrics by category
    const categories = {
      "📏 Size": ["ncloc", "lines", "statements", "functions", "classes", "files"],
      "🧠 Complexity": ["complexity", "cognitive_complexity"],
      "🐛 Issues": ["bugs", "vulnerabilities", "code_smells", "security_hotspots"],
      "⭐ Ratings": ["reliability_rating", "security_rating", "sqale_rating", "security_review_rating"],
      "📊 Coverage": ["coverage", "line_coverage", "branch_coverage", "uncovered_lines", "uncovered_conditions"],
      "📋 Duplications": ["duplicated_lines_density", "duplicated_blocks", "duplicated_files"],
      "⏱️ Technical Debt": ["sqale_index", "sqale_debt_ratio"],
    };

    const measureMap = new Map(measures.map(m => [m.metric, m]));

    for (const [category, metricKeys] of Object.entries(categories)) {
      const categoryMeasures = metricKeys
        .map(key => measureMap.get(key))
        .filter((m): m is ComponentMeasure => m?.value !== undefined);

      if (categoryMeasures.length === 0) continue;

      lines.push(`### ${category}`);

      for (const measure of categoryMeasures) {
        const value = this.formatMetricValue(measure.metric, measure.value ?? "");
        const periodInfo = measure.period 
          ? ` (new code: ${this.formatMetricValue(measure.metric, measure.period.value)})`
          : "";
        
        lines.push(`- **${this.getMetricLabel(measure.metric)}:** ${value}${periodInfo}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Get human-readable label for a metric
   */
  private getMetricLabel(metricKey: string): string {
    const labels: Record<string, string> = {
      ncloc: "Lines of Code",
      lines: "Total Lines",
      statements: "Statements",
      functions: "Functions",
      classes: "Classes",
      files: "Files",
      complexity: "Cyclomatic Complexity",
      cognitive_complexity: "Cognitive Complexity",
      bugs: "Bugs",
      vulnerabilities: "Vulnerabilities",
      code_smells: "Code Smells",
      security_hotspots: "Security Hotspots",
      reliability_rating: "Reliability",
      security_rating: "Security",
      sqale_rating: "Maintainability",
      security_review_rating: "Security Review",
      coverage: "Coverage",
      line_coverage: "Line Coverage",
      branch_coverage: "Branch Coverage",
      uncovered_lines: "Uncovered Lines",
      uncovered_conditions: "Uncovered Conditions",
      duplicated_lines_density: "Duplication",
      duplicated_blocks: "Duplicated Blocks",
      duplicated_files: "Files with Duplications",
      sqale_index: "Technical Debt",
      sqale_debt_ratio: "Debt Ratio",
    };
    return labels[metricKey] ?? metricKey;
  }

  /**
   * Format metric value for display
   */
  private formatMetricValue(metricKey: string, value: string): string {
    // Ratings (1-5 -> A-E)
    if (metricKey.includes("rating")) {
      const numericValue = Number.parseInt(value, 10);
      if (numericValue >= 1 && numericValue <= 5) {
        return MetricFormatter.rating(numericValue);
      }
      return value;
    }

    // Percentages
    if (metricKey.includes("coverage") || metricKey.includes("density") || metricKey.includes("ratio")) {
      return MetricFormatter.percentage(value, 1);
    }

    // Technical debt (minutes)
    if (metricKey === "sqale_index") {
      const minutes = Number.parseInt(value, 10);
      if (minutes < 60) return `${minutes}min`;
      if (minutes < 1440) return MetricFormatter.duration(minutes);
      return `${Math.floor(minutes / 1440)}d`;
    }

    return value;
  }
}
