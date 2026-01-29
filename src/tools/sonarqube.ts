/**
 * SonarQube Custom Tool for OpenCode Agent
 * Allows the agent to trigger analysis and get issues
 * 
 * This module has been refactored to use separate handler modules for better maintainability.
 */

import { z } from "zod";
// Types are used by handlers, not directly here
import { loadConfig } from "../utils/config.ts";
import { needsBootstrap, getProjectState } from "../bootstrap/index.ts";
import { Logger } from "../utils/logger.ts";
import { formatError } from "./formatters.ts";
import { ErrorMessages } from "../utils/error-messages.ts";

// Import all handlers from the handlers directory
import {
  createHandlerContext,
  handleSetup,
  handleAnalyze,
  handleIssues,
  handleNewIssues,
  handleWorstFiles,
  handleStatus,
  handleValidate,
  handleHotspots,
  handleReviewHotspot,
  handleDuplications,
  handleRule,
  handleHistory,
  handleProfile,
  handleBranches,
  handleMetrics,
} from "./handlers/index.ts";

const logger = new Logger("sonarqube-tool");

/**
 * Tool argument schema
 */
export const SonarQubeToolArgsSchema = z.object({
  action: z
    .enum(["analyze", "issues", "newissues", "status", "init", "setup", "validate", "hotspots", "reviewhotspot", "duplications", "rule", "history", "profile", "branches", "metrics", "worstfiles"])
    .describe("Action to perform: analyze (run scanner), issues (all issues), newissues (only new code issues), status (quality gate), init/setup (initialize), validate (enterprise check), hotspots (security review), duplications (code duplicates), rule (explain rule), history (past analyses), profile (quality profile), branches (branch status), metrics (detailed metrics), worstfiles (files with most issues)"),
  
  scope: z
    .enum(["all", "new", "changed"])
    .optional()
    .default("all")
    .describe("Scope of analysis: all files, only new code, or changed files"),
  
  severity: z
    .enum(["blocker", "critical", "major", "minor", "info", "all"])
    .optional()
    .default("all")
    .describe("Filter issues by minimum severity level"),
  
  fix: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, include fix suggestions in the response"),
  
  projectKey: z
    .string()
    .optional()
    .describe("Override the project key (usually auto-detected)"),

  force: z
    .boolean()
    .optional()
    .default(false)
    .describe("Force re-initialization even if already set up"),

  ruleKey: z
    .string()
    .optional()
    .describe("Rule key to explain (e.g., 'typescript:S1234') - required for 'rule' action"),

  branch: z
    .string()
    .optional()
    .describe("Branch name for multi-branch analysis (default: main branch)"),

  hotspotKey: z
    .string()
    .optional()
    .describe("Hotspot key to review (UUID). If omitted with 'reviewhotspot' action, all TO_REVIEW hotspots are bulk-reviewed."),

  resolution: z
    .enum(["SAFE", "FIXED", "ACKNOWLEDGED"])
    .optional()
    .describe("Hotspot review resolution: SAFE (no risk), FIXED (remediated), ACKNOWLEDGED (accepted risk)"),

  comment: z
    .string()
    .optional()
    .describe("Review comment explaining the decision"),
});

export type SonarQubeToolArgs = z.infer<typeof SonarQubeToolArgsSchema>;

/** Handler context type */
import type { HandlerContext } from "./handlers/index.ts";
import type { SonarQubeConfig } from "../types/index.ts";

/**
 * Format error for missing configuration
 */
function getMissingConfigError(): string {
  return formatError(ErrorMessages.configurationMissing(
    "SonarQube configuration not found.",
    [
      "Set environment variables: SONAR_HOST_URL, SONAR_USER, and SONAR_PASSWORD",
      "Or create a .sonarqube/config.json file in your project",
      "Or add plugin configuration in opencode.json",
    ]
  ) + `

Required environment variables:
- SONAR_HOST_URL (e.g., https://sonarqube.company.com)
- SONAR_USER (e.g., admin)
- SONAR_PASSWORD (password or token)`);
}

/**
 * Run bootstrap if needed
 */
async function ensureBootstrapped(config: SonarQubeConfig, directory: string): Promise<string | null> {
  if (!(await needsBootstrap(directory))) {
    return null;
  }
  
  logger.info("First run detected, running bootstrap");
  const { bootstrap } = await import("../bootstrap/index.ts");
  const result = await bootstrap({ config, directory });
  
  if (!result.success) {
    return formatError(`Setup Failed\n\n${result.message}`);
  }
  
  logger.info("Bootstrap completed", { projectKey: result.projectKey });
  return null;
}

/**
 * Route action to appropriate handler
 */
async function routeAction(ctx: HandlerContext, args: SonarQubeToolArgs): Promise<string> {
  const handlers: Record<string, () => Promise<string>> = {
    analyze: () => handleAnalyze(ctx, args),
    issues: () => handleIssues(ctx, args),
    newissues: () => handleNewIssues(ctx, args),
    status: () => handleStatus(ctx),
    validate: () => handleValidate(ctx),
    hotspots: () => handleHotspots(ctx),
    reviewhotspot: () => handleReviewHotspot(ctx, args.hotspotKey, args.resolution, args.comment),
    duplications: () => handleDuplications(ctx),
    rule: () => handleRule(ctx, args.ruleKey),
    history: () => handleHistory(ctx, args.branch),
    profile: () => handleProfile(ctx),
    branches: () => handleBranches(ctx),
    metrics: () => handleMetrics(ctx, args.branch),
    worstfiles: () => handleWorstFiles(ctx),
  };
  
  const handler = handlers[args.action];
  return handler ? handler() : formatError(`Unknown action: ${args.action}`);
}

/**
 * Handle execution errors with appropriate messages
 */
function handleExecutionError(error: unknown, action: string, serverUrl: string): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Tool execution failed: ${errorMessage}`);
  
  if (!(error instanceof Error) || !("code" in error)) {
    return formatError(ErrorMessages.apiError(action, errorMessage, serverUrl));
  }
  
  const errorCode = (error as { code: string }).code;
  
  if (errorCode === "CONNECTION_ERROR" || errorMessage.includes("Cannot connect")) {
    return formatError(ErrorMessages.connectionError(serverUrl));
  }
  
  if (errorMessage.includes("timed out")) {
    return formatError(ErrorMessages.timeoutError(action, 30000));
  }
  
  if (errorCode === "AUTH_ERROR") {
    return formatError(ErrorMessages.authenticationError(errorMessage));
  }
  
  return formatError(ErrorMessages.apiError(action, errorMessage, serverUrl));
}

/**
 * Execute the SonarQube tool
 */
export async function executeSonarQubeTool(
  args: SonarQubeToolArgs,
  context: { directory?: string; config?: Record<string, unknown> }
): Promise<string> {
  const directory = context.directory ?? process.cwd();
  const rawConfig = (context.config?.["sonarqube"] as Record<string, unknown> | undefined) ?? context.config;
  const config = loadConfig(rawConfig);
  
  if (!config) {
    return getMissingConfigError();
  }

  logger.info(`Executing SonarQube tool: ${args.action}`, { directory });

  try {
    if (args.action === "init" || args.action === "setup") {
      return await handleSetup(config, directory, args.force);
    }

    const bootstrapError = await ensureBootstrapped(config, directory);
    if (bootstrapError) return bootstrapError;

    const state = await getProjectState(directory);
    if (!state) {
      return formatError(`Project not initialized. Run with action: "setup" first.`);
    }

    const ctx = createHandlerContext(config, state, args.projectKey ?? state.projectKey, directory);
    return await routeAction(ctx, args);
  } catch (error) {
    return handleExecutionError(error, args.action, config.url);
  }
}

/**
 * Create the tool definition for OpenCode
 */
export function createSonarQubeTool(configGetter: () => Record<string, unknown> | undefined) {
  return {
    sonarqube: {
      description: `Run SonarQube code analysis and get quality metrics.

Actions:
- setup: Initialize project (auto-creates on SonarQube if needed)
- analyze: Run full analysis and get issues
- issues: Get all current issues
- newissues: Get only issues in NEW code (Clean as You Code)
- worstfiles: Show files with the most issues (prioritize refactoring)
- status: Get quality gate status and metrics
- validate: Check if project meets enterprise quality standards
- hotspots: Get security hotspots requiring manual review
- duplications: Find code duplications across the project
- rule: Explain a specific SonarQube rule (requires ruleKey)
- history: Show past analysis history
- profile: Show quality profile configuration
- branches: Show branch analysis status
- metrics: Show detailed code metrics

Example usage:
- sonarqube({ action: "setup" }) - Initialize project (first run)
- sonarqube({ action: "analyze", fix: true }) - Run analysis with fix suggestions
- sonarqube({ action: "newissues" }) - Issues only in your recent changes
- sonarqube({ action: "worstfiles" }) - Files needing most attention
- sonarqube({ action: "issues", severity: "critical" }) - Get only critical+ issues
- sonarqube({ action: "status" }) - Check quality gate status
- sonarqube({ action: "validate" }) - Validate enterprise quality standards`,

      args: {
        action: SonarQubeToolArgsSchema.shape.action,
        scope: SonarQubeToolArgsSchema.shape.scope,
        severity: SonarQubeToolArgsSchema.shape.severity,
        fix: SonarQubeToolArgsSchema.shape.fix,
        projectKey: SonarQubeToolArgsSchema.shape.projectKey,
        force: SonarQubeToolArgsSchema.shape.force,
        ruleKey: SonarQubeToolArgsSchema.shape.ruleKey,
        branch: SonarQubeToolArgsSchema.shape.branch,
      },

      async execute(
        args: SonarQubeToolArgs,
        ctx: { directory?: string }
      ): Promise<string> {
        return executeSonarQubeTool(args, {
          directory: ctx.directory,
          config: configGetter(),
        });
      },
    },
  };
}
