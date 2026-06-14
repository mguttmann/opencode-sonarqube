/**
 * Metrics handler for SonarQube tool
 */

import type { HandlerContext } from "../base-handler.ts";
import { formatEmptyState, formatSuccess } from "../formatters.ts";

/**
 * Handle metrics action - show detailed code metrics
 */
export async function handleMetrics(
  ctx: HandlerContext,
  branch?: string
): Promise<string> {
  const { api, projectKey } = ctx;
  const measures = await api.metrics.getMeasuresWithPeriod({
    componentKey: projectKey,
    branch,
  });
  
  if (measures.length === 0) {
    return formatSuccess("Code Metrics", formatEmptyState("metrics", projectKey, "This could mean:\n1. No analysis has been run yet\n2. The analysis is still processing\n\nRun `sonarqube({ action: \"analyze\" })` to generate metrics."));
  }

  let output = api.metrics.formatMeasuresForAgent(measures);
  
  // Add interpretation help
  output += `
### Metric Interpretation

**Ratings:** A (best) to E (worst)
- **A:** No issues or minimal impact
- **B:** Minor issues
- **C:** Moderate issues
- **D:** Significant issues  
- **E:** Critical issues

**Coverage:** Higher is better (aim for 80%+)
**Duplications:** Lower is better (aim for <3%)
**Technical Debt:** Time to fix all maintainability issues`;

  return output;
}
