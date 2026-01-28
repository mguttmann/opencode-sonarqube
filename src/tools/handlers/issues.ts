/**
 * Issues handlers for SonarQube tool
 */

import type { HandlerContext } from "../base-handler.ts";
import { formatIssuesForAgent, getSeveritiesFromLevel, SEVERITIES } from "../../utils/severity.ts";
import { formatEmptyState, formatSuccess } from "../formatters.ts";
import type { SonarQubeToolArgs } from "../sonarqube.ts";
import { API } from "../../constants.ts";

/**
 * Handle issues action - get current issues with source context
 */
export async function handleIssues(
  ctx: HandlerContext,
  args: SonarQubeToolArgs
): Promise<string> {
  const { api, projectKey } = ctx;

  // Map severity filter to array
  const severities = args.severity === "all" 
    ? undefined 
    : getSeveritiesFromLevel(args.severity ?? "all");

  const issues = await api.issues.getFormattedIssues({
    projectKey,
    severities,
  });

  if (issues.length === 0) {
    return formatSuccess("Issues", formatEmptyState("issues matching your criteria", projectKey, "Code quality looks good!"));
  }

  // Get quality gate status
  const qgStatus = await api.qualityGate.getStatus(projectKey);

  // Get source context for critical issues (top 10 blockers/critical)
  const criticalIssues = issues
    .filter(i => i.severity === "BLOCKER" || i.severity === "CRITICAL")
    .slice(0, 10);

  let output = formatIssuesForAgent(issues, qgStatus.projectStatus.status);

  // Add source context for critical issues if fix mode
  if (args.fix && criticalIssues.length > 0) {
    try {
      const issuesWithContext = await api.sources.getIssuesWithContext(
        criticalIssues.map(i => ({
          key: i.key,
          rule: i.rule,
          severity: i.severity,
          message: i.message,
          component: `${projectKey}:${i.file}`,
          line: i.line,
        })),
        API.SOURCE_CONTEXT_LINES
      );

      output += "\n\n---\n\n## Code Context for Critical Issues\n\n";
      output += "Review the following code sections that need fixing:\n\n";

      for (const issue of issuesWithContext) {
        output += api.sources.formatIssueWithContext(issue);
        output += "\n\n";
      }
    /* c8 ignore start - error handling for failed source fetching */
    } catch {
      // If source fetching fails, continue without context
    }
    /* c8 ignore stop */
  }

  return output;
}

/**
 * Handle newissues action - get issues only in new code period
 */
export async function handleNewIssues(
  ctx: HandlerContext,
  args: SonarQubeToolArgs
): Promise<string> {
  const { api, projectKey } = ctx;

  // Map severity filter to array
  const severities = args.severity === "all" 
    ? undefined 
    : getSeveritiesFromLevel(args.severity ?? "all");

  const response = await api.issues.search({
    projectKey,
    severities,
    inNewCode: true,
    resolved: false,
    pageSize: API.DEFAULT_PAGE_SIZE,
  });

  const issues = api.issues.formatIssues(response.issues, response.components);

  if (issues.length === 0) {
    return formatSuccess("New Code Issues", formatEmptyState("issues in new code", projectKey, "Your recent changes are clean.\n\nThis means all code written during the current \"new code period\" passes quality standards."));
  }

  let output = `## New Code Issues (Clean as You Code)

**Project:** \`${projectKey}\`
**Issues in New Code:** ${issues.length}

These issues were introduced in your recent changes and should be fixed before merging.

`;

  // Group by severity
  const bySeverity: Record<string, typeof issues> = {};
  for (const issue of issues) {
    if (!bySeverity[issue.severity]) bySeverity[issue.severity] = [];
    bySeverity[issue.severity].push(issue);
  }

  for (const sev of SEVERITIES) {
    const sevIssues = bySeverity[sev];
    if (!sevIssues || sevIssues.length === 0) continue;

    output += `### ${sev} (${sevIssues.length})\n\n`;
    for (const issue of sevIssues.slice(0, 10)) {
      output += `- **${issue.file}:${issue.line ?? "?"}** - ${issue.message}\n`;
      output += `  Rule: \`${issue.rule}\`\n`;
    }
    if (sevIssues.length > 10) {
      output += `\n*... and ${sevIssues.length - 10} more ${sev} issues*\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Handle worstfiles action - show files with most issues
 */
export async function handleWorstFiles(ctx: HandlerContext): Promise<string> {
  const { api, projectKey } = ctx;
  const worstFiles = await api.components.getWorstFiles(projectKey, 20);
  
  if (worstFiles.length === 0) {
    return formatSuccess("Files with Issues", formatEmptyState("files with issues", projectKey, "Your codebase is clean!"));
  }

  let output = api.components.formatWorstFilesForAgent(worstFiles);

  // Add actionable advice
  output += `
### Next Steps

Focus your refactoring efforts on these files to maximize code quality improvement.
Use \`sonarqube({ action: "issues" })\` to see detailed issues for specific files.`;

  return output;
}
