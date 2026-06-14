/**
 * OpenCode Plugin Hooks for SonarQube
 * Handles session.idle and file.edited events
 */

import type { SonarQubeConfig, ProjectState, AnalysisResult, BootstrapResult } from "../types/index.ts";
import { loadConfig } from "../utils/config.ts";
import { runAnalysis, formatAnalysisResult } from "../scanner/index.ts";
import { bootstrap, needsBootstrap, getProjectState } from "../bootstrap/index.ts";
import { Logger } from "../utils/logger.ts";

const logger = new Logger("sonarqube-hooks");

/**
 * Minimum time between auto-analyses (5 minutes)
 */
const ANALYSIS_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Per-instance hook state — each createHooks() call gets its own state
 * to prevent cross-project interference in multi-project setups.
 */
interface HookState {
  editedFiles: Set<string>;
  lastAnalysisTime: number;
  bootstrapInProgress: boolean;
}

function createHookState(): HookState {
  return {
    editedFiles: new Set<string>(),
    lastAnalysisTime: 0,
    bootstrapInProgress: false,
  };
}

// Legacy module-level state for backward compatibility with getEditedFiles()/clearEditedFiles()
// These are used by index.ts and tests
let activeState: HookState = createHookState();

/**
 * Check if config is valid and analysis is enabled
 */
function isAnalysisEnabled(config: SonarQubeConfig | null): config is SonarQubeConfig {
  return config !== null && config.level !== "off" && config.autoAnalyze;
}

/**
 * Check if analysis should be skipped due to cooldown
 */
function isInCooldown(state: HookState): boolean {
  const now = Date.now();
  return now - state.lastAnalysisTime < ANALYSIS_COOLDOWN_MS;
}

/**
 * Handle bootstrap process
 */
async function handleBootstrap(
  config: SonarQubeConfig,
  directory: string,
  hookState: HookState
): Promise<string | undefined> {
  if (hookState.bootstrapInProgress) {
    logger.debug("Bootstrap already in progress");
    return undefined;
  }

  logger.info("First run detected - initializing SonarQube integration");
  hookState.bootstrapInProgress = true;

  try {
    const result = await bootstrap({ config, directory });
    hookState.bootstrapInProgress = false;
    return result.success 
      ? formatBootstrapMessage(result)
      : `**SonarQube Setup Failed**\n\n${result.message}`;
  } catch (error) {
    hookState.bootstrapInProgress = false;
    logger.error("Bootstrap failed", { error: String(error) });
    const errorMsg = error instanceof Error ? error.message : String(error);
    return `**SonarQube Setup Error**\n\n${errorMsg}`;
  }
}

/**
 * Run analysis and format results
 */
async function performAnalysis(
  config: SonarQubeConfig,
  state: ProjectState,
  directory: string,
  hookState: HookState
): Promise<string | undefined> {
  const projectKey = state.projectKey;
  const projectName = config.projectName ?? projectKey;

  const result = await runAnalysis(
    config,
    state,
    {
      projectKey,
      projectName,
      sources: config.sources,
      tests: config.tests,
    },
    directory
  );

  // Only clear tracked files if analysis succeeded — otherwise they'd be lost
  if (result.success) {
    hookState.editedFiles.clear();
  }

  return formatAnalysisOutput(result, config);
}

/**
 * Format analysis output with action prompts
 */
function formatAnalysisOutput(
  result: AnalysisResult,
  config: SonarQubeConfig
): string | undefined {
  // Only return message if there are issues or the gate failed
  const hasIssues = result.formattedIssues.length > 0;
  const gateFailed = result.qualityGateStatus !== "OK";

  if (!hasIssues && !gateFailed) {
    return undefined;
  }

  let message = formatAnalysisResult(result);
  message += formatActionPrompt(result, config);

  return message;
}

/**
 * Format action prompt for critical issues
 */
function formatActionPrompt(
  result: AnalysisResult,
  _config: SonarQubeConfig
): string {
  const blockerCount = result.issues.blocker;
  const criticalCount = result.issues.critical;

  if (blockerCount === 0 && criticalCount === 0) {
    return "";
  }

  return `\n\n---\n\n**Action Required:** Found ${blockerCount} blocker(s) and ${criticalCount} critical issue(s). Please review and fix these issues before continuing.`;
}

/**
 * Create the session.idle hook handler
 * Triggers automatic analysis when the agent becomes idle
 */
export function createIdleHook(
  getConfig: () => Record<string, unknown> | undefined,
  getDirectory: () => string,
  hookState: HookState = activeState
) {
  return async function handleSessionIdle(): Promise<string | undefined> {
    const rawConfig = getConfig()?.["sonarqube"] as Record<string, unknown> | undefined;
    const config = loadConfig(rawConfig);

    if (!isAnalysisEnabled(config)) {
      return undefined;
    }

    const directory = getDirectory();

    // Handle bootstrap if needed
    if (await needsBootstrap(directory)) {
      return handleBootstrap(config, directory, hookState);
    }

    // Skip if in cooldown
    if (isInCooldown(hookState)) {
      logger.debug("Skipping auto-analysis (cooldown)");
      return undefined;
    }

    // Skip if no edited files
    if (hookState.editedFiles.size === 0) {
      logger.debug("Skipping auto-analysis (no edited files)");
      return undefined;
    }

    logger.info("Session idle - triggering auto-analysis");
    hookState.lastAnalysisTime = Date.now();

    try {
      const state = await getProjectState(directory);
      if (!state) {
        logger.warn("No project state found, cannot run analysis");
        return undefined;
      }

      return await performAnalysis(config, state, directory, hookState);
    } catch (error) {
      logger.error(`Auto-analysis failed: ${error}`);
      return undefined;
    }
  };
}

/**
 * Format bootstrap result message
 */
function formatBootstrapMessage(result: BootstrapResult): string {
  const lines: string[] = [
    "## SonarQube Integration Initialized",
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

  lines.push(
    "",
    "The integration is now ready. Code quality analysis will run automatically on idle.",
    "",
    "*Tip: Use the `sonarqube` tool to run analysis manually or check status.*"
  );

  return lines.join("\n");
}

/**
 * Patterns for files to ignore in tracking
 */
const IGNORED_FILE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist\//,
  /build\//,
  /coverage\//,
  /\.lock$/,
  /package-lock\.json$/,
  /\.d\.ts$/,
  /\.sonarqube\//,
];

/**
 * Check if a file should be ignored
 */
function shouldIgnoreFile(filePath: string): boolean {
  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * Create the file.edited hook handler
 * Tracks edited files for targeted analysis
 */
export function createFileEditedHook(hookState: HookState = activeState) {
  return function handleFileEdited(input: { filePath: string }): void {
    const { filePath } = input;

    if (!shouldIgnoreFile(filePath)) {
      hookState.editedFiles.add(filePath);
      activeState = hookState; // Keep legacy accessor in sync
      logger.debug(`Tracked edited file: ${filePath}`);
    }
  };
}

/**
 * Get the list of currently tracked edited files
 */
export function getEditedFiles(): string[] {
  return Array.from(activeState.editedFiles);
}

/**
 * Clear the edited files tracking
 */
export function clearEditedFiles(): void {
  activeState.editedFiles.clear();
}

/**
 * Reset the analysis cooldown (useful for testing)
 */
export function resetAnalysisCooldown(): void {
  activeState.lastAnalysisTime = 0;
}

/**
 * Create all hooks for the plugin
 */
export function createHooks(
  getConfig: () => Record<string, unknown> | undefined,
  getDirectory: () => string
) {
  // Each createHooks() call gets its own isolated state
  // This prevents cross-project interference in multi-project setups
  const hookState = createHookState();
  activeState = hookState; // Set as the active state for legacy accessors
  return {
    sessionIdle: createIdleHook(getConfig, getDirectory, hookState),
    fileEdited: createFileEditedHook(hookState),
    getEditedFiles: () => Array.from(hookState.editedFiles),
  };
}
