/**
 * CLI Support for OpenCode SonarQube Plugin
 * 
 * This module provides command-line interface functionality.
 * It is separate from the main plugin to avoid OpenCode trying to load
 * CLI exports as plugins.
 * 
 * @module opencode-sonarqube/cli
 */

import { loadConfig } from "./utils/config.ts";
import { createSonarQubeAPI } from "./api/index.ts";
import { runAnalysis, formatAnalysisResult } from "./scanner/index.ts";
import { bootstrap, getProjectState, needsBootstrap } from "./bootstrap/index.ts";
import type { SonarQubeConfig, ProjectState } from "./types/index.ts";

/**
 * CLI Help text
 */
export const CLI_HELP = `
opencode-sonarqube - SonarQube integration for OpenCode

Usage:
  bun run src/index.ts [options]

Options:
  --setup             Initialize project (first run)
  --analyze           Run SonarQube analysis
  --status            Show quality gate status
  --issues            Show current issues
  --hotspots          Show security hotspots
  --project-key=KEY   Override project key
  --help, -h          Show this help

Environment Variables:
  SONAR_HOST_URL      SonarQube server URL
  SONAR_USER          SonarQube username
  SONAR_PASSWORD      SonarQube password
`;

/**
 * CLI Result interface
 */
export interface CLIResult {
  success: boolean;
  output: string;
  exitCode: number;
}

/**
 * Handle --setup command
 */
async function handleSetup(
  config: SonarQubeConfig,
  directory: string,
  force: boolean
): Promise<CLIResult> {
  const result = await bootstrap({ config, directory, force });
  return {
    success: result.success,
    output: result.success ? `Initializing SonarQube project...\n${result.message}` : result.message,
    exitCode: result.success ? 0 : 1,
  };
}

/**
 * Handle --analyze command
 */
async function handleAnalyze(
  config: SonarQubeConfig,
  state: ProjectState,
  projectKey: string,
  directory: string
): Promise<CLIResult> {
  const result = await runAnalysis(config, state, { projectKey }, directory);
  return {
    success: true,
    output: `Running analysis for ${projectKey}...\n${formatAnalysisResult(result)}`,
    exitCode: 0,
  };
}

/**
 * Handle --status command
 */
async function handleStatus(
  config: SonarQubeConfig,
  state: ProjectState,
  projectKey: string
): Promise<CLIResult> {
  const api = createSonarQubeAPI(config, state);
  const status = await api.qualityGate.getStatus(projectKey);
  return {
    success: true,
    output: api.qualityGate.formatStatus(status),
    exitCode: 0,
  };
}

/**
 * Handle --issues command
 */
async function handleIssues(
  config: SonarQubeConfig,
  state: ProjectState,
  projectKey: string
): Promise<CLIResult> {
  const api = createSonarQubeAPI(config, state);
  const issues = await api.issues.getFormattedIssues({ projectKey });
  const lines = [`Found ${issues.length} issues`];
  for (const issue of issues.slice(0, 20)) {
    lines.push(`- [${issue.severity}] ${issue.file}:${issue.line ?? "?"} - ${issue.message}`);
  }
  return {
    success: true,
    output: lines.join("\n"),
    exitCode: 0,
  };
}

/**
 * Handle --hotspots command
 */
async function handleHotspots(
  config: SonarQubeConfig,
  state: ProjectState,
  projectKey: string
): Promise<CLIResult> {
  const api = createSonarQubeAPI(config, state);
  try {
    const hotspots = await api.issues.getSecurityHotspots(projectKey);
    if (hotspots.length === 0) {
      return {
        success: true,
        output: "No security hotspots found. Good job!",
        exitCode: 0,
      };
    }
    const hotspotLines = hotspots.slice(0, 10).flatMap((hotspot) => [
      `- [${hotspot.vulnerabilityProbability}] ${hotspot.component}:${hotspot.line ?? "?"}`,
      `  ${hotspot.message}`,
    ]);
    const output = [
      `Found ${hotspots.length} security hotspots to review:`,
      ...hotspotLines,
    ].join("\n");
    return {
      success: true,
      output,
      exitCode: 0,
    };
  } catch {
    return {
      success: true,
      output: "Security hotspots API not available (requires SonarQube 8.2+)",
      exitCode: 0,
    };
  }
}

/**
 * Extract project key from args or state
 */
function getProjectKeyFromArgs(args: string[], state: ProjectState): string | undefined {
  const projectKeyArg = args.find((a) => a.startsWith("--project-key="));
  return projectKeyArg ? projectKeyArg.split("=")[1] : state.projectKey;
}

/**
 * Run CLI command
 */
export async function runCLI(
  args: string[],
  directory: string = process.cwd()
): Promise<CLIResult> {
  // Handle help
  if (args.includes("--help") || args.includes("-h")) {
    return { success: true, output: CLI_HELP, exitCode: 0 };
  }

  // Load config
  const config = loadConfig();
  if (!config) {
    return {
      success: false,
      output: "Error: SonarQube not configured\nSet SONAR_HOST_URL, SONAR_USER, and SONAR_PASSWORD environment variables",
      exitCode: 1,
    };
  }

  // Handle setup
  if (args.includes("--setup")) {
    return handleSetup(config, directory, args.includes("--force"));
  }

  // Check if setup is needed
  if (await needsBootstrap(directory)) {
    const result = await bootstrap({ config, directory });
    if (!result.success) {
      return {
        success: false,
        output: `Project not initialized. Running setup...\nSetup failed: ${result.message}`,
        exitCode: 1,
      };
    }
  }

  // Get state
  const state = await getProjectState(directory);
  if (!state) {
    return {
      success: false,
      output: "Error: Could not load project state",
      exitCode: 1,
    };
  }

  // Determine project key
  const projectKey = getProjectKeyFromArgs(args, state);
  if (!projectKey) {
    return {
      success: false,
      output: "Error: Could not determine project key",
      exitCode: 1,
    };
  }

  // Handle commands
  if (args.includes("--analyze")) {
    return handleAnalyze(config, state, projectKey, directory);
  }

  if (args.includes("--status")) {
    return handleStatus(config, state, projectKey);
  }

  if (args.includes("--issues")) {
    return handleIssues(config, state, projectKey);
  }

  if (args.includes("--hotspots")) {
    return handleHotspots(config, state, projectKey);
  }

  // No command specified
  return {
    success: true,
    output: "Use --help for usage information",
    exitCode: 0,
  };
}

/**
 * Execute CLI and handle output/exit
 */
export async function executeCLI(
  args: string[] = process.argv.slice(2),
  log: (msg: string) => void = console.log,
  exit: (code: number) => never = process.exit
): Promise<void> {
  const result = await runCLI(args);
  log(result.output);
  exit(result.exitCode);
}

/**
 * CLI entry point
 * Only run CLI when explicitly invoked via command line
 */
const isDirectCLI = import.meta.main && process.argv[1]?.includes("cli.ts");
if (isDirectCLI) {
  await executeCLI();
}
