/**
 * Duplications handler for SonarQube tool
 */

import type { HandlerContext } from "../base-handler.ts";
import { formatEmptyState, formatSuccess } from "../formatters.ts";

/**
 * Handle duplications action - find code duplicates
 */
export async function handleDuplications(ctx: HandlerContext): Promise<string> {
  const { api, projectKey } = ctx;

  const duplications = await api.duplications.getProjectDuplications(projectKey);

  if (duplications.length === 0) {
    return formatSuccess("Code Duplications", formatEmptyState("code duplications", projectKey, "Your code follows the DRY (Don't Repeat Yourself) principle!"));
  }

  let output = `## Code Duplications

**Project:** \`${projectKey}\`
**Duplications Found:** ${duplications.length}

`;

  output += api.duplications.formatForAgent(duplications);

  return output;
}
