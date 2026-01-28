/**
 * History handlers for SonarQube tool
 */

import type { HandlerContext } from "../base-handler.ts";
import { formatEmptyState, formatSuccess } from "../formatters.ts";

/**
 * Handle history action - show past analyses
 */
export async function handleHistory(
  ctx: HandlerContext,
  branch?: string
): Promise<string> {
  const { api, projectKey } = ctx;
  const analyses = await api.analyses.getAnalyses({ projectKey, branch, pageSize: 10 });
  
  if (analyses.length === 0) {
    return formatSuccess("Analysis History", formatEmptyState("analysis history", projectKey, "This could mean:\n1. The project was recently created\n2. No analyses have been run yet\n3. The branch has no analysis history\n\nRun `sonarqube({ action: \"analyze\" })` to create the first analysis."));
  }

  return api.analyses.formatAnalysesForAgent(analyses);
}

/**
 * Handle profile action - show quality profile information
 */
export async function handleProfile(ctx: HandlerContext): Promise<string> {
  const { api, projectKey } = ctx;
  const profiles = await api.profiles.getProjectProfiles(projectKey);
  
  if (profiles.length === 0) {
    return formatSuccess("Quality Profiles", formatEmptyState("quality profiles", projectKey, "This is unusual - every project should have at least one profile per language.\nPlease check the SonarQube server configuration."));
  }

  let output = api.profiles.formatProfilesForAgent(profiles, projectKey);
  
  // Add helpful context
  output += `
### About Quality Profiles

Quality profiles define which rules are active for your project. Each language has its own profile.
The **Sonar way** profile is a recommended starting point maintained by SonarSource.

To view all available rules, visit your SonarQube server's Rules page.`;

  return output;
}

/**
 * Handle branches action - show branch information
 */
export async function handleBranches(ctx: HandlerContext): Promise<string> {
  const { api, projectKey } = ctx;
  const branches = await api.branches.getBranches(projectKey);
  
  if (branches.length === 0) {
    return formatSuccess("Project Branches", formatEmptyState("branch information", projectKey, "This usually means:\n1. Branch analysis is not enabled (Community Edition limitation)\n2. Only the main branch has been analyzed\n\nTo analyze a specific branch, use:\n`sonarqube({ action: \"analyze\", branch: \"feature-branch\" })`"));
  }

  return api.branches.formatBranchesForAgent(branches);
}
