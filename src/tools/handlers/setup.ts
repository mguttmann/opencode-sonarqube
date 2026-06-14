/**
 * Setup handler for SonarQube tool
 */

import { mkdir } from "node:fs/promises";
import type { SonarQubeConfig } from "../../types/index.ts";
import { bootstrap } from "../../bootstrap/index.ts";
import { detectSourceDirectories } from "../../scanner/config/detection.ts";
import { validateAndRepairAll } from "../../scanner/config/validation.ts";
import { Logger } from "../../utils/logger.ts";

const logger = new Logger("sonarqube-handler-setup");

/**
 * Handle setup/init action - bootstrap the project
 */
export async function handleSetup(
  config: SonarQubeConfig,
  directory: string,
  force: boolean = false
): Promise<string> {
  const result = await bootstrap({ config, directory, force });

  if (!result.success) {
    return `## SonarQube Setup Failed

${result.message}`;
  }

  // Create or repair config.json
  /* c8 ignore start */
  const sonarqubeDir = `${directory}/.sonarqube`;
  const configPath = `${sonarqubeDir}/config.json`;
  const configExists = await Bun.file(configPath).exists();
  
  if (configExists) {
    // Validate and repair existing config
    const validation = await validateAndRepairAll(directory);
    if (validation.repairs.length > 0) {
      logger.info("Repaired existing config", { repairs: validation.repairs });
    }
  } else {
    // Ensure .sonarqube directory exists
    await mkdir(sonarqubeDir, { recursive: true });
    
    const detectedSources = detectSourceDirectories(directory);
    const defaultConfig = {
      level: config.level || "enterprise",
      autoAnalyze: true,
      sources: config.sources || detectedSources,
      newCodeDefinition: "previous_version",
    };
    
    await Bun.write(configPath, JSON.stringify(defaultConfig, null, 2));
    logger.info("Created default config.json", { path: configPath });
  }
  /* c8 ignore stop */

  const lines = [
    "## SonarQube Project Initialized",
    "",
    result.message,
    "",
    "**Configuration:**",
    `- Project Key: \`${result.projectKey}\``,
    `- Languages: ${result.languages.join(", ")}`,
  ];

  if (result.qualityGate) {
    lines.push(`- Quality Gate: ${result.qualityGate}`);
  }

  const projectStatusMessage = result.isNewProject
    ? "A new project was created on your SonarQube server."
    : "Connected to existing project on SonarQube server.";

  lines.push("", projectStatusMessage, "", "Run with action: \"analyze\" to start code analysis.");

  return lines.join("\n");
}
