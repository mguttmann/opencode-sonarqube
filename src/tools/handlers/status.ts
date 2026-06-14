/**
 * Status handlers for SonarQube tool
 */

import type { HandlerContext } from "../base-handler.ts";

/**
 * Handle status action - get quality gate status
 */
export async function handleStatus(ctx: HandlerContext): Promise<string> {
  const { api, projectKey } = ctx;

  const [qgStatus, metrics] = await Promise.all([
    api.qualityGate.getStatus(projectKey),
    api.qualityGate.getQualityMetrics(projectKey),
  ]);

  const statusIcon = qgStatus.projectStatus.status === "OK" ? "[PASS]" : "[FAIL]";

  let output = `## SonarQube Status

**Project:** \`${projectKey}\`
**Quality Gate:** ${statusIcon} ${qgStatus.projectStatus.status}

### Metrics
| Metric | Value |
|--------|-------|
| Coverage | ${metrics.coverage?.toFixed(1) ?? "N/A"}% |
| Duplications | ${metrics.duplications?.toFixed(1) ?? "N/A"}% |
| Bugs | ${metrics.bugs} |
| Vulnerabilities | ${metrics.vulnerabilities} |
| Code Smells | ${metrics.codeSmells} |
| Security Hotspots | ${metrics.securityHotspots} |

### Ratings
| Category | Rating |
|----------|--------|
| Reliability | ${metrics.reliabilityRating} |
| Security | ${metrics.securityRating} |
| Maintainability | ${metrics.maintainabilityRating} |
| Lines of Code | ${metrics.linesOfCode.toLocaleString()} |
`;

  // Add failed conditions
  const failedConditions = qgStatus.projectStatus.conditions.filter(
    (c) => c.status !== "OK"
  );

  if (failedConditions.length > 0) {
    output += "\n### Failed Conditions\n";
    const hasHotspotCondition = failedConditions.some(
      (c) => c.metricKey.includes("security_hotspots") || c.metricKey.includes("hotspot")
    );
    for (const condition of failedConditions) {
      output += `- **${condition.metricKey}**: ${condition.actualValue} (threshold: ${condition.errorThreshold})\n`;
    }

    if (hasHotspotCondition) {
      output += `\n### How to Fix Security Hotspot Condition
The Quality Gate is failing because unreviewed security hotspots exist.
You can review them directly:

1. **List hotspots:** \`sonarqube({ action: "hotspots" })\`
2. **Bulk-review all as safe:** \`sonarqube({ action: "reviewhotspot", resolution: "SAFE" })\`
3. **Review individually:** \`sonarqube({ action: "reviewhotspot", hotspotKey: "<key>", resolution: "SAFE", comment: "reason" })\`
`;
    }
  }

  return output;
}

/**
 * Handle validate action - check enterprise quality standards
 */
export async function handleValidate(ctx: HandlerContext): Promise<string> {
  const { api, projectKey, config } = ctx;

  const result = await api.qualityGate.validateEnterpriseQuality(projectKey, config.level);

  let output = api.qualityGate.formatEnterpriseValidation(result);

  // Add action recommendation
  if (result.passed) {
    output += `\n\n---\n\n**Congratulations!** Project meets all ${config.level} quality standards.`;
  } else {
    output += `\n\n---\n\n**Action Required:** Project does not meet ${config.level} quality standards.`;
    output += "\n\nPlease fix the failed checks before proceeding.";
  }

  return output;
}
