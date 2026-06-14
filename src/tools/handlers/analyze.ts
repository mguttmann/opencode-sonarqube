/**
 * Analyze handler for SonarQube tool
 */

import type { HandlerContext } from "../base-handler.ts";
import { runAnalysis, formatAnalysisResult } from "../../scanner/index.ts";
import { validateAndRepairAll } from "../../scanner/config/validation.ts";
import type { SonarQubeToolArgs } from "../sonarqube.ts";
import { formatFixSuggestions } from "../formatters/suggestions.ts";

/**
 * Handle analyze action - run the scanner
 */
export async function handleAnalyze(
  ctx: HandlerContext,
  args: SonarQubeToolArgs
): Promise<string> {
  const { config, state, projectKey, directory } = ctx;
  const projectName = config.projectName ?? projectKey;

  // Validate and auto-repair config before scanning
  const validation = await validateAndRepairAll(directory);

  // If config was repaired, reload sources from disk
  let effectiveSources = config.sources;
  let effectiveTests = config.tests;
  if (validation.repairs.length > 0) {
    try {
      const repairedConfig = await Bun.file(`${directory}/.sonarqube/config.json`).json();
      effectiveSources = repairedConfig.sources ?? effectiveSources;
      effectiveTests = repairedConfig.tests ?? effectiveTests;
    } catch {
      // Repaired config couldn't be read, continue with original values
    }
  }

  // Run analysis (sources auto-detected if not configured)
  const result = await runAnalysis(
    config,
    state,
    {
      projectKey,
      projectName,
      sources: effectiveSources,
      tests: effectiveTests,
      exclusions: config.exclusions,
    },
    directory
  );

  // Format result
  let output = "";

  // Show any config repairs that were applied
  if (validation.repairs.length > 0) {
    output += "### Config Auto-Repair\n";
    for (const repair of validation.repairs) {
      output += `- ${repair}\n`;
    }
    output += "\n";
  }

  output += formatAnalysisResult(result);

  // Add fix suggestions if requested
  if (args.fix && result.formattedIssues.length > 0) {
    output += formatFixSuggestions(result.formattedIssues);
  }

  return output;
}
