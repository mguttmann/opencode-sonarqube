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

/**
 * Execute the SonarQube tool
 * 
 * This function routes the action to the appropriate handler module.
 */
export async function executeSonarQubeTool(
  args: SonarQubeToolArgs,
  context: {
    directory?: string;
    config?: Record<string, unknown>;
  }
): Promise<string> {
  const directory = context.directory ?? process.cwd();

  // Load configuration - unwrap if nested under "sonarqube" key (OpenCode wraps plugin config)
  const rawConfig = (context.config?.["sonarqube"] as Record<string, unknown> | undefined) ?? context.config;
  const config = loadConfig(rawConfig);
  if (!config) {
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

  logger.info(`Executing SonarQube tool: ${args.action}`, { directory });

  try {
    // Handle init/setup action
    if (args.action === "init" || args.action === "setup") {
      return await handleSetup(config, directory, args.force);
    }

    // For all other actions, check if bootstrap is needed
    if (await needsBootstrap(directory)) {
      logger.info("First run detected, running bootstrap");
      const { bootstrap } = await import("../bootstrap/index.ts");
      const setupResult = await bootstrap({ config, directory });
      if (!setupResult.success) {
        return formatError(`Setup Failed\n\n${setupResult.message}`);
      }
      logger.info("Bootstrap completed", { projectKey: setupResult.projectKey });
    }

    // Get project state
    const state = await getProjectState(directory);
    if (!state) {
      return formatError(`Project not initialized. Run with action: "setup" first.`);
    }

    const projectKey = args.projectKey ?? state.projectKey;

    // Create handler context once for all handlers
    const ctx = createHandlerContext(config, state, projectKey, directory);

    // Route to appropriate handler
    switch (args.action) {
      case "analyze":
        return await handleAnalyze(ctx, args);

      case "issues":
        return await handleIssues(ctx, args);

      case "newissues":
        return await handleNewIssues(ctx, args);

      case "status":
        return await handleStatus(ctx);

      case "validate":
        return await handleValidate(ctx);

      case "hotspots":
        return await handleHotspots(ctx);

      case "reviewhotspot":
        return await handleReviewHotspot(ctx, args.hotspotKey, args.resolution, args.comment);

      case "duplications":
        return await handleDuplications(ctx);

      case "rule":
        return await handleRule(ctx, args.ruleKey);

      case "history":
        return await handleHistory(ctx, args.branch);

      case "profile":
        return await handleProfile(ctx);

      case "branches":
        return await handleBranches(ctx);

      case "metrics":
        return await handleMetrics(ctx, args.branch);

      case "worstfiles":
        return await handleWorstFiles(ctx);

      default:
        return formatError(`Unknown action: ${args.action}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Tool execution failed: ${errorMessage}`);
    return formatError(ErrorMessages.apiError(args.action, errorMessage, config.url));
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
