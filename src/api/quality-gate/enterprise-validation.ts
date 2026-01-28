/**
 * Enterprise Quality Validation
 * Functions for validating projects against enterprise quality thresholds
 */

import type {
  EnterpriseQualityThresholds,
  QualityCheckResult,
  EnterpriseValidationResult,
} from "../../types/index.ts";
import { ratingToNumber, numberToRating } from "../../types/index.ts";

/**
 * Quality metrics structure used for validation
 */
export interface QualityMetrics {
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
}

/**
 * Run all enterprise quality checks against metrics
 */
export function runEnterpriseChecks(
  metrics: QualityMetrics,
  thresholds: EnterpriseQualityThresholds
): QualityCheckResult[] {
  const coverage = metrics.coverage ?? 0;
  const duplications = metrics.duplications ?? 0;
  const reliabilityNum = ratingToNumber(metrics.reliabilityRating);
  const securityNum = ratingToNumber(metrics.securityRating);
  const maintainabilityNum = ratingToNumber(metrics.maintainabilityRating);
  const expectedReliability = numberToRating(thresholds.minReliabilityRating);
  const expectedSecurity = numberToRating(thresholds.minSecurityRating);
  const expectedMaintainability = numberToRating(thresholds.minMaintainabilityRating);

  return [
    {
      name: "Coverage",
      passed: coverage >= thresholds.minCoverage,
      actual: `${coverage.toFixed(1)}%`,
      expected: `>= ${thresholds.minCoverage}%`,
      message: coverage >= thresholds.minCoverage
        ? `Coverage ${coverage.toFixed(1)}% meets threshold`
        : `Coverage ${coverage.toFixed(1)}% is below ${thresholds.minCoverage}% threshold`,
    },
    {
      name: "Duplications",
      passed: duplications <= thresholds.maxDuplications,
      actual: `${duplications.toFixed(1)}%`,
      expected: `<= ${thresholds.maxDuplications}%`,
      message: duplications <= thresholds.maxDuplications
        ? `Duplications ${duplications.toFixed(1)}% meets threshold`
        : `Duplications ${duplications.toFixed(1)}% exceeds ${thresholds.maxDuplications}% threshold`,
    },
    {
      name: "Bugs",
      passed: metrics.bugs <= thresholds.maxBugs,
      actual: metrics.bugs,
      expected: `<= ${thresholds.maxBugs}`,
      message: metrics.bugs <= thresholds.maxBugs
        ? `${metrics.bugs} bugs meets threshold`
        : `${metrics.bugs} bugs exceeds ${thresholds.maxBugs} threshold`,
    },
    {
      name: "Vulnerabilities",
      passed: metrics.vulnerabilities <= thresholds.maxVulnerabilities,
      actual: metrics.vulnerabilities,
      expected: `<= ${thresholds.maxVulnerabilities}`,
      message: metrics.vulnerabilities <= thresholds.maxVulnerabilities
        ? `${metrics.vulnerabilities} vulnerabilities meets threshold`
        : `${metrics.vulnerabilities} vulnerabilities exceeds ${thresholds.maxVulnerabilities} threshold`,
    },
    {
      name: "Code Smells",
      passed: metrics.codeSmells <= thresholds.maxCodeSmells,
      actual: metrics.codeSmells,
      expected: `<= ${thresholds.maxCodeSmells}`,
      message: metrics.codeSmells <= thresholds.maxCodeSmells
        ? `${metrics.codeSmells} code smells meets threshold`
        : `${metrics.codeSmells} code smells exceeds ${thresholds.maxCodeSmells} threshold`,
    },
    {
      name: "Security Hotspots",
      passed: metrics.securityHotspots <= thresholds.maxSecurityHotspots,
      actual: metrics.securityHotspots,
      expected: `<= ${thresholds.maxSecurityHotspots}`,
      message: metrics.securityHotspots <= thresholds.maxSecurityHotspots
        ? `${metrics.securityHotspots} security hotspots meets threshold`
        : `${metrics.securityHotspots} security hotspots exceeds ${thresholds.maxSecurityHotspots} threshold`,
    },
    {
      name: "Reliability Rating",
      passed: reliabilityNum <= thresholds.minReliabilityRating,
      actual: metrics.reliabilityRating,
      expected: `>= ${expectedReliability}`,
      message: reliabilityNum <= thresholds.minReliabilityRating
        ? `Reliability rating ${metrics.reliabilityRating} meets threshold`
        : `Reliability rating ${metrics.reliabilityRating} is below ${expectedReliability} threshold`,
    },
    {
      name: "Security Rating",
      passed: securityNum <= thresholds.minSecurityRating,
      actual: metrics.securityRating,
      expected: `>= ${expectedSecurity}`,
      message: securityNum <= thresholds.minSecurityRating
        ? `Security rating ${metrics.securityRating} meets threshold`
        : `Security rating ${metrics.securityRating} is below ${expectedSecurity} threshold`,
    },
    {
      name: "Maintainability Rating",
      passed: maintainabilityNum <= thresholds.minMaintainabilityRating,
      actual: metrics.maintainabilityRating,
      expected: `>= ${expectedMaintainability}`,
      message: maintainabilityNum <= thresholds.minMaintainabilityRating
        ? `Maintainability rating ${metrics.maintainabilityRating} meets threshold`
        : `Maintainability rating ${metrics.maintainabilityRating} is below ${expectedMaintainability} threshold`,
    },
  ];
}

/**
 * Format enterprise validation result for display
 */
export function formatEnterpriseValidation(result: EnterpriseValidationResult): string {
  const statusIcon = result.passed ? "[PASS]" : "[FAIL]";
  const checkRows = result.checks.map(check => {
    const status = check.passed ? "PASS" : "FAIL";
    return `| ${check.name} | ${status} | ${check.actual} | ${check.expected} |`;
  });
  
  const metricsRows = [
    `| Coverage | ${result.metrics.coverage?.toFixed(1) ?? "N/A"}% |`,
    `| Duplications | ${result.metrics.duplications?.toFixed(1) ?? "N/A"}% |`,
    `| Bugs | ${result.metrics.bugs} |`,
    `| Vulnerabilities | ${result.metrics.vulnerabilities} |`,
    `| Code Smells | ${result.metrics.codeSmells} |`,
    `| Security Hotspots | ${result.metrics.securityHotspots} |`,
    `| Reliability Rating | ${result.metrics.reliabilityRating} |`,
    `| Security Rating | ${result.metrics.securityRating} |`,
    `| Maintainability Rating | ${result.metrics.maintainabilityRating} |`,
    `| Lines of Code | ${result.metrics.linesOfCode.toLocaleString()} |`,
  ];

  const failedSection = result.passed ? [] : [
    "",
    "### Failed Checks",
    "",
    ...result.checks.filter(c => !c.passed).map(check => `- **${check.name}**: ${check.message}`),
  ];

  return [
    `## Enterprise Quality Validation ${statusIcon}`,
    "",
    `**Project:** \`${result.projectKey}\``,
    `**Level:** ${result.level}`,
    `**Result:** ${result.summary}`,
    "",
    "### Quality Checks",
    "",
    "| Check | Status | Actual | Expected |",
    "|-------|--------|--------|----------|",
    ...checkRows,
    "",
    "### Current Metrics",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    ...metricsRows,
    ...failedSection,
  ].join("\n");
}
