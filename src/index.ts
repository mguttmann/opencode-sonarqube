/**
 * OpenCode SonarQube Plugin
 * Enterprise-level code quality integration for OpenCode
 *
 * @module opencode-sonarqube
 * @author Manuel Guttmann
 * @license MIT
 * @version 1.2.3
 */

import type { Plugin, Hooks, ToolContext } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { loadConfig } from "./utils/config.ts";
import { createHooks, getEditedFiles } from "./hooks/index.ts";
import { createSonarQubeAPI } from "./api/index.ts";

import { bootstrap, getProjectState, needsBootstrap } from "./bootstrap/index.ts";
import { executeSonarQubeTool } from "./tools/sonarqube.ts";
import type { SonarQubeConfig } from "./types/index.ts";

// Import shared state management from dedicated module
import {
  registerDirectory,
  mapSessionToDirectory,
  getDirectoryForSession,
} from "./utils/shared-state.ts";

// NOTE: We intentionally do NOT re-export types/utilities here
// OpenCode iterates through all exports and tries to load them as plugins
// Only the SonarQubePlugin function should be exported from this module

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
  /\.map$/,
];

/**
 * Check if a file should be ignored for tracking
 */
function shouldIgnoreFile(filePath: string): boolean {
  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * OpenCode SonarQube Plugin
 *
 * Provides:
 * - Custom tool for AI agent to run SonarQube analysis
 * - Hooks for automatic analysis on session.idle
 * - File tracking via file.edited events
 * - Toast notifications for analysis status
 * - Session compaction context preservation
 * - Automatic project setup on first use
 *
 * Configuration:
 * 
 * 1. Add to opencode.json:
 * ```json
 * { "plugin": ["opencode-sonarqube"] }
 * ```
 * 
 * 2. Set environment variables (in ~/.zshrc or ~/.bashrc):
 * ```bash
 * export SONAR_HOST_URL="https://your-sonarqube-server.com"
 * export SONAR_USER="admin"
 * export SONAR_PASSWORD="your-password"
 * ```
 * 
 * 3. Optional: Create .sonarqube/config.json for project-specific settings:
 * ```json
 * { "level": "enterprise", "autoAnalyze": true }
 * ```
 * 
 * First run: Use sonarqube({ action: "setup" }) to initialize the project.
 */
export const SonarQubePlugin: Plugin = async ({ client, directory, worktree }) => {
  // Debug logging - disabled for production
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const safeLog = (_msg: string) => {
    // No-op - enable for debugging: appendFileSync("/tmp/sonarqube-plugin-debug.log", `${new Date().toISOString()} ${_msg}\n`);
  };
  
  // Store the import.meta.url at plugin init time - this is unique per project's node_modules
  const pluginImportUrl = import.meta.url;
  
  /* c8 ignore start */
  // Derive directory from import.meta.url - only useful if plugin is installed per-project
  const resolveDirectoryFromImportUrl = (): string | null => {
    try {
      const pluginPath = decodeURIComponent(pluginImportUrl.replace("file://", ""));
      const pathParts = pluginPath.split("/");
      const nodeModulesIndex = pathParts.indexOf("node_modules");
      if (nodeModulesIndex > 0) {
        const projectPath = pathParts.slice(0, nodeModulesIndex).join("/");
        // IMPORTANT: Don't use import.meta.url path if it's in ~/.cache/opencode (global install)
        // In that case, rely on directory/worktree passed by OpenCode
        if (projectPath && projectPath !== "/" && projectPath.length > 1 && !projectPath.includes(".cache/opencode")) {
          return projectPath;
        }
      }
    } catch {
      // Ignore
    }
    return null;
  };
  
  // OpenCode Desktop sometimes passes "/" as directory - detect and fix this
  // PRIORITY ORDER: worktree > directory > import.meta.url > cwd > home
  const resolveValidDirectory = (): string => {
    // First, trust what OpenCode passes (worktree is most specific)
    if (worktree && worktree !== "/" && worktree.length > 1) {
      safeLog(`Using worktree: ${worktree}`);
      return worktree;
    }
    if (directory && directory !== "/" && directory.length > 1) {
      safeLog(`Using directory: ${directory}`);
      return directory;
    }
    // Fallback to import.meta.url (for per-project installs)
    const fromImportUrl = resolveDirectoryFromImportUrl();
    if (fromImportUrl) {
      safeLog(`Using fromImportUrl: ${fromImportUrl}`);
      return fromImportUrl;
    }
    const cwd = process.cwd();
    if (cwd && cwd !== "/" && cwd.length > 1) {
      safeLog(`Using cwd: ${cwd}`);
      return cwd;
    }
    return process.env["HOME"] || "/Users";
  };
  /* c8 ignore stop */
  
  const effectiveDirectory = resolveValidDirectory();
  safeLog(`FINAL effectiveDirectory=${effectiveDirectory}`);
  
  // Register this directory in SHARED state (filesystem-based for multi-project support)
  registerDirectory(effectiveDirectory);
  
  // Safe client.app.log - don't fail plugin init if this fails
  /* c8 ignore start - OpenCode client API call */
  try {
    await client.app.log({
      body: {
        service: "opencode-sonarqube",
        level: "info",
        message: "SonarQube plugin initialized",
        extra: { directory, worktree, effectiveDirectory },
      },
    });
  } catch {
    safeLog("client.app.log failed (non-fatal)");
  }
  /* c8 ignore stop */

  // Configuration state - loaded on demand, reloaded periodically
  let pluginConfig: Record<string, unknown> | undefined;
  let pluginConfigLoadedAt = 0;
  const CONFIG_RELOAD_INTERVAL_MS = 60_000; // Re-check config file every 60s
  
  // Cache for system.transform API results (avoid 3 API calls per chat message)
  // Keyed by directory to avoid serving wrong data in multi-project setups
  const transformCacheMap = new Map<string, { data: string | undefined; timestamp: number }>();
  const TRANSFORM_CACHE_TTL_MS = 60_000; // 60 seconds

  // Track last analysis results for compaction context
  let lastAnalysisResult: {
    qualityGate: string;
    issues: { blocker: number; critical: number; major: number; minor: number; info: number };
    timestamp: string;
  } | undefined;

  // Config getter for tools and hooks
  const getConfig = () => pluginConfig;
  
  // CRITICAL FIX: getDirectory() must ALWAYS derive from pluginImportUrl
  // This ensures each plugin instance (per project) returns its own directory
  // even if the module is cached by the bundler
  /* c8 ignore start */
  const getDirectory = (): string => {
    // Always derive from the pluginImportUrl captured at init time for THIS instance
    const fromImportUrl = resolveDirectoryFromImportUrl();
    if (fromImportUrl) {
      return fromImportUrl;
    }
    // Fallback to the validated directory from init
    return effectiveDirectory;
  };
  /* c8 ignore stop */

  // Load config from opencode.json
  const loadPluginConfig = async () => {
    // Reload config periodically so mid-session changes are picked up
    if (pluginConfig && (Date.now() - pluginConfigLoadedAt) < CONFIG_RELOAD_INTERVAL_MS) return;
    pluginConfig = undefined; // Force reload
    
    const dir = getDirectory();
    // Try .sonarqube/config.json first (recommended)
    const sonarConfigPath = `${dir}/.sonarqube/config.json`;
    /* c8 ignore start - config file loading */
    try {
      const configFile = Bun.file(sonarConfigPath);
      if (await configFile.exists()) {
        const config = await configFile.json();
        pluginConfig = { sonarqube: config };
        pluginConfigLoadedAt = Date.now();
        safeLog(`Config loaded from ${sonarConfigPath}`);
        return;
      }
    } catch { /* ignore */ }
    /* c8 ignore stop */
    
    // Fallback: env vars only (no config file needed)
    pluginConfig = {};
    pluginConfigLoadedAt = Date.now();
    safeLog("Using environment variables for config");
  };

  // Create hooks
  const hooks = createHooks(getConfig, getDirectory);

  // Track current session for message injection
  let currentSessionId: string | undefined;
  
  // Track which sessions have had their initial quality check
  const initialCheckSessions = new Set<string>();

  /**
   * Build notification message for quality issues
   */
  const buildQualityNotification = (
    qgStatus: string,
    counts: { blocker: number; critical: number; major: number },
    qgFailed: boolean
  ): string => {
    const statusEmoji = qgFailed ? "[FAIL]" : "[WARN]";
    const blockerNote = counts.blocker > 0 ? "**Action Required:** There are BLOCKER issues that should be fixed.\n" : "";
    return `## SonarQube Status: ${statusEmoji}

**Quality Gate:** ${qgStatus}
**Outstanding Issues:** ${counts.blocker} blockers, ${counts.critical} critical, ${counts.major} major

${blockerNote}Use \`sonarqube({ action: "issues" })\` to see details or \`sonarqube({ action: "analyze" })\` to re-analyze.`;
  };

  /**
   * Perform initial quality check when session starts
   */
  const performInitialQualityCheck = async (sessionId: string) => {
    if (initialCheckSessions.has(sessionId)) return;
    initialCheckSessions.add(sessionId);

    try {
      await loadPluginConfig();
      const sonarConfig = pluginConfig?.["sonarqube"] as Record<string, unknown> | undefined;
      const config = loadConfig(sonarConfig);
      if (!config || config.level === "off") return;

      const dir = getDirectory();
      safeLog(`performInitialQualityCheck: dir=${dir}`);
      
      // Auto-bootstrap new projects
      /* c8 ignore start - auto-bootstrap is tested separately */
      if (await needsBootstrap(dir)) {
        safeLog(`performInitialQualityCheck: running bootstrap for ${dir}`);
        const result = await bootstrap({ config, directory: dir });
        if (!result.success) {
          safeLog(`performInitialQualityCheck: bootstrap failed: ${result.message}`);
          return;
        }
        await showToast(`SonarQube: Project "${result.projectKey}" created`, "success");
      }
      /* c8 ignore stop */

      const state = await getProjectState(dir);
      if (!state?.projectKey) return;

      const api = createSonarQubeAPI(config, state);
      const [qgStatus, counts] = await Promise.all([
        api.qualityGate.getStatus(state.projectKey),
        api.issues.getCounts(state.projectKey),
      ]);

      const hasIssues = counts.blocker > 0 || counts.critical > 0 || counts.major > 0;
      const qgFailed = qgStatus.projectStatus.status !== "OK";
      if (!hasIssues && !qgFailed) return;

      const notification = buildQualityNotification(qgStatus.projectStatus.status, counts, qgFailed);
      await client.session.prompt({
        path: { id: sessionId },
        body: { noReply: true, parts: [{ type: "text", text: notification }] },
      });
      await showToast(
        qgFailed ? "SonarQube: Quality Gate Failed" : "SonarQube: Issues Found",
        qgFailed ? "error" : "info"
      );
    } catch (error) {
      safeLog(`performInitialQualityCheck error: ${error}`);
    }
  };

  /**
   * Show toast notification via TUI
   */
  const showToast = async (message: string, variant: "success" | "error" | "info" = "info") => {
    try {
      await client.tui.showToast({
        body: { message, variant },
      });
    } catch {
      // TUI might not be available (e.g., in non-interactive mode)
    }
  };

  // Regex patterns for parsing analysis results
  // Match both formats: "**Quality Gate:** [PASS] OK" and "**Quality Gate: OK**"
  const qualityGatePattern = /Quality Gate[:\s*]*\[(?:PASS|FAIL)\]\s*(\w+)|\*\*Quality Gate:\s*(\w+)\*\*/;
  const issueCountPattern = /Blockers: (\d+), Critical: (\d+), Major: (\d+), Minor: (\d+), Info: (\d+)/;

  /**
   * Parse analysis message and extract result data
   */
  const parseAnalysisResult = (message: string) => {
    const resultMatch = qualityGatePattern.exec(message);
    const issueMatch = issueCountPattern.exec(message);

    if (!resultMatch || !issueMatch) {
      return undefined;
    }

    return {
      qualityGate: resultMatch[1] || resultMatch[2],
      issues: {
        blocker: Number.parseInt(issueMatch[1], 10),
        critical: Number.parseInt(issueMatch[2], 10),
        major: Number.parseInt(issueMatch[3], 10),
        minor: Number.parseInt(issueMatch[4], 10),
        info: Number.parseInt(issueMatch[5], 10),
      },
      timestamp: new Date().toISOString(),
    };
  };

  /**
   * Handle session tracking events
   * CRITICAL: This also maps session IDs to directories for multi-project support
   */
  const handleSessionTrackingEvent = (event: { type: string; properties?: unknown }) => {
    if (event.type !== "session.created" && event.type !== "session.updated") {
      return;
    }
    // Official API: session.created/updated properties = { info: Session }
    // Session has { id, projectID, directory, ... }
    const payload = event.properties as { info?: { id?: string } } | undefined;
    const sessionId = payload?.info?.id;
    if (sessionId) {
      currentSessionId = sessionId;
      
      // Map this session to the current effective directory
      // This is critical for multi-project support!
      // Uses filesystem-based shared state so all module instances can read it
      if (event.type === "session.created") {
        mapSessionToDirectory(sessionId, effectiveDirectory);
      }
    }
  };

  /**
   * Handle file edited events
   */
  const handleFileEditedEvent = (event: { type: string; properties?: unknown }) => {
    if (event.type !== "file.edited") {
      return;
    }
    // Official API: file.edited properties = { file: string }
    const payload = event.properties as { file?: string } | undefined;
    if (payload?.file && !shouldIgnoreFile(payload.file)) {
      hooks.fileEdited({ filePath: payload.file });
    }
  };

  /**
   * Inject analysis results and optionally trigger auto-fix
   */
  const injectAnalysisResults = async (
    message: string,
    _config: SonarQubeConfig,
    sessionId: string
  ) => {
    try {
      await client.session.prompt({
        path: { id: sessionId },
        body: {
          noReply: true,
          parts: [{ type: "text", text: message }],
        },
      });
    } catch (error) {
      await client.app.log({
        body: {
          service: "opencode-sonarqube",
          level: "error",
          message: "Failed to inject analysis results",
          extra: { error: String(error) },
        },
      });
    }
  };

  /**
   * Handle session idle event for auto-analysis
   */
  const handleSessionIdleEvent = async () => {
    await loadPluginConfig();

    const sonarConfig = pluginConfig?.["sonarqube"] as Record<string, unknown> | undefined;
    const config = loadConfig(sonarConfig);

    if (!config || config.level === "off" || !config.autoAnalyze) {
      return;
    }

    // Use per-instance getter to avoid multi-project state leaks
    const editedFiles = hooks.getEditedFiles?.() ?? getEditedFiles();
    if (editedFiles.length === 0) {
      return;
    }

    const message = await hooks.sessionIdle();
    if (!message || !currentSessionId) {
      return;
    }

    const parsedResult = parseAnalysisResult(message);
    if (parsedResult) {
      lastAnalysisResult = parsedResult;
    }

    const passed = message.includes("[PASS]") || (message.includes("Quality Gate") && message.includes("OK"));
    await showToast(
      passed ? "SonarQube: Quality Gate Passed" : "SonarQube: Issues Found",
      passed ? "success" : "error"
    );

    await injectAnalysisResults(message, config, currentSessionId);
  };

  /**
   * Build compaction context message
   */
  const buildCompactionContext = (): string => {
    if (!lastAnalysisResult) {
      return "";
    }

    const { timestamp, qualityGate, issues } = lastAnalysisResult;
    const statusNote = qualityGate === "OK"
      ? "Code quality is good."
      : "NOTE: There are outstanding quality issues that need to be addressed.";

    return `## SonarQube Analysis State

Last analysis: ${timestamp}
Quality Gate: ${qualityGate}
Issues: ${issues.blocker} blockers, ${issues.critical} critical, ${issues.major} major

${statusNote}`;
  };

  // NOTE: Pre-commit/pre-push blocking has been removed.
  // Use the sonarqube tool directly: sonarqube({ action: 'analyze' }) or sonarqube({ action: 'issues' })



  /**
   * Log SonarQube tool results
   */
  const logSonarQubeResult = async (
    input: { tool: string },
    output: { output: string }
  ) => {
    if (input.tool !== "sonarqube") return;

    const result = output.output;
    const passed = result?.includes("[PASS]") ?? false;
    const failed = result?.includes("[FAIL]") ?? false;

    if (passed || failed) {
      await client.app.log({
        body: {
          service: "opencode-sonarqube",
          level: passed ? "info" : "warn",
          message: `SonarQube analysis completed: ${passed ? "PASSED" : "FAILED"}`,
          extra: { tool: input.tool },
        },
      });
    }
  };

  /**
   * Track file changes from write/edit tools
   */
  const trackFileChanges = async (
    input: { tool: string },
    output: { output: string }
  ) => {
    const codeChangeTools = ["write", "edit", "mcp_write", "mcp_edit"];
    if (!codeChangeTools.includes(input.tool)) return;

    await loadPluginConfig();
    const sonarConfig = pluginConfig?.["sonarqube"] as Record<string, unknown> | undefined;
    const config = loadConfig(sonarConfig);

    if (!config || config.level === "off" || !config.autoAnalyze) return;

    const outputData = output.output;
    const filePathRegex = /(?:wrote|edited|modified)\s+(?:file\s+)?['"]?([^\s'"]+)/i;
    const filePathMatch = outputData ? filePathRegex.exec(outputData) : null;
    const filePath = filePathMatch?.[1];

    if (filePath && !shouldIgnoreFile(filePath)) {
      hooks.fileEdited({ filePath });
      await client.app.log({
        body: {
          service: "opencode-sonarqube",
          level: "debug",
          message: `Tracked file change: ${filePath}`,
        },
      });
    }
  };

  /**
   * Handle git operations (pull, push, etc.)
   */
  const handleGitOperations = async (
    input: { tool: string },
    output: { output: string; metadata?: { command?: string } }
  ) => {
    const isBashTool = input.tool === "bash" || input.tool === "mcp_bash";
    if (!isBashTool) return;

    const outputData = output.output;
    const command = output.metadata?.command ?? "";

    await loadPluginConfig();
    const sonarConfig = pluginConfig?.["sonarqube"] as Record<string, unknown> | undefined;
    const config = loadConfig(sonarConfig);

    if (!config || config.level === "off") return;

    // After git pull/merge/rebase - suggest analysis
    await handleGitPullMerge(command, outputData);

    // After git push - show notification
    await handleGitPush(command, outputData);
  };

  /**
   * Handle git pull/merge/rebase operations
   */
  const handleGitPullMerge = async (command: string, outputData: string) => {
    if (!/git\s+(pull|merge|rebase|checkout)\b/.test(command)) return;
    if (!currentSessionId) return;

    const hasChanges = outputData?.includes("changed") ||
                       outputData?.includes("Fast-forward") ||
                       outputData?.includes("Updating");

    if (hasChanges) {
      await client.session.prompt({
        path: { id: currentSessionId },
        body: {
          noReply: true,
          parts: [{
            type: "text",
            text: `## SonarQube: New Code Detected

Git operation completed with changes. Consider running:
- \`sonarqube({ action: "newissues" })\` - Check if new code introduced issues
- \`sonarqube({ action: "analyze" })\` - Full analysis of current state`,
          }],
        },
      });
    }
  };

  /**
   * Handle git push operations
   */
  const handleGitPush = async (command: string, outputData: string) => {
    if (!/git\s+push\b/.test(command)) return;
    if (outputData?.includes("error:") || outputData?.includes("fatal:") || outputData?.includes("rejected")) return;

    await showToast("Code pushed - SonarQube will analyze on server", "info");
  };

  // Safe wrapper to prevent errors from crashing OpenCode
  const safeAsync = <T extends (...args: any[]) => Promise<any>>(fn: T, name: string): T => {
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error) {
        safeLog(`[ERROR] ${name} failed: ${error}`);
        // Don't re-throw - let OpenCode continue
      }
    }) as T;
  };

  /**
   * Build the system transform context string (extracted to reduce cognitive complexity)
   */
  const buildSystemTransformContext = async (_input: unknown): Promise<string | undefined> => {
    safeLog(`=== system.transform ENTERED ===`);
    
    const inputAny = _input as Record<string, unknown>;
    const sessionID = inputAny?.sessionID as string | undefined;
    
    const sessionDir = sessionID ? getDirectoryForSession(sessionID) : undefined;
    const dir = sessionDir || effectiveDirectory;
    safeLog(`  dir used: "${dir}"`);
    
    // Use cached result if still fresh
    const now = Date.now();
    const cachedEntry = transformCacheMap.get(dir);
    if (cachedEntry && (now - cachedEntry.timestamp) < TRANSFORM_CACHE_TTL_MS) {
      return cachedEntry.data;
    }

    await loadPluginConfig();
    const sonarConfig = pluginConfig?.["sonarqube"] as Record<string, unknown> | undefined;
    const config = loadConfig(sonarConfig);

    if (!config || config.level === "off") {
      transformCacheMap.set(dir, { data: undefined, timestamp: now });
      return undefined;
    }

    const state = await getProjectState(dir);
    if (!state?.projectKey) {
      transformCacheMap.set(dir, { data: undefined, timestamp: now });
      return undefined;
    }

    const api = createSonarQubeAPI(config, state);
    
    const [qgStatus, counts, newCodeResponse] = await Promise.all([
      api.qualityGate.getStatus(state.projectKey),
      api.issues.getCounts(state.projectKey),
      api.issues.search({
        projectKey: state.projectKey,
        inNewCode: true,
        resolved: false,
        pageSize: 1,
      }).catch(() => ({ paging: { total: 0 } })),
    ]);

    const qgFailed = qgStatus.projectStatus.status !== "OK";
    const newCodeIssues = newCodeResponse.paging.total;
    const hasIssues = counts.blocker > 0 || counts.critical > 0;

    if (!hasIssues && !qgFailed && newCodeIssues === 0) {
      transformCacheMap.set(dir, { data: undefined, timestamp: now });
      return undefined;
    }

    const hotspotInfo = await buildHotspotInfo(api, state.projectKey);
    const systemContext = formatSystemContext(qgStatus.projectStatus.status, qgFailed, counts, newCodeIssues, hotspotInfo, config.level);
    transformCacheMap.set(dir, { data: systemContext, timestamp: now });
    return systemContext;
  };

  /**
   * Check for unreviewed hotspots and build info string
   */
  const buildHotspotInfo = async (api: ReturnType<typeof createSonarQubeAPI>, projectKey: string): Promise<string> => {
    try {
      const hotspotsToReview = await api.issues.getSecurityHotspotsToReview(projectKey);
      if (hotspotsToReview.length > 0) {
        return `**Security Hotspots:** ${hotspotsToReview.length} unreviewed hotspots (may cause Quality Gate to fail)
**To fix:** \`sonarqube({ action: "hotspots" })\` to list, then \`sonarqube({ action: "reviewhotspot", resolution: "SAFE" })\` to bulk-review
`;
      }
    } catch { /* hotspots API may not be available */ }
    return "";
  };

  /**
   * Format the system context string
   */
  const formatSystemContext = (
    qgStatusText: string,
    qgFailed: boolean,
    counts: { blocker: number; critical: number; major: number },
    newCodeIssues: number,
    hotspotInfo: string,
    level: string
  ): string => {
    const lines = [
      "## SonarQube Code Quality Status",
      "",
      `**Quality Gate:** ${qgStatusText}${qgFailed ? " (FAILED)" : ""}`,
      `**Outstanding Issues:** ${counts.blocker} blockers, ${counts.critical} critical, ${counts.major} major`,
    ];

    if (newCodeIssues > 0) {
      lines.push(`**New Code Issues:** ${newCodeIssues} issues in recent changes`);
    }
    if (hotspotInfo) {
      lines.push(hotspotInfo);
    }
    if (counts.blocker > 0) {
      lines.push("**IMPORTANT:** There are BLOCKER issues that must be fixed before shipping code.");
    }
    if (level === "enterprise") {
      lines.push("This project follows enterprise-level quality standards (zero tolerance for issues).");
    }
    lines.push(
      "",
      "**Recommended Actions:**",
      "- `sonarqube({ action: \"newissues\" })` - See issues in your recent changes (Clean as You Code)",
      "- `sonarqube({ action: \"worstfiles\" })` - Find files needing most attention",
      "- `sonarqube({ action: \"issues\" })` - See all issues",
    );
    if (hotspotInfo) {
      lines.push("- `sonarqube({ action: \"reviewhotspot\", resolution: \"SAFE\" })` - Bulk-review all security hotspots as safe");
    }

    return lines.join("\n");
  };

  safeLog(`=== PLUGIN INIT COMPLETE, returning hooks ===`);
  safeLog(`  This instance's pluginImportUrl: "${pluginImportUrl}"`);
  safeLog(`  This instance's effectiveDirectory: "${effectiveDirectory}"`);
  
  const returnHooks: Hooks = {
    /**
     * Event handler for OpenCode events
     */
    event: safeAsync(async ({ event }) => {
      handleSessionTrackingEvent(event);
      handleFileEditedEvent(event);

      // Perform initial quality check when a new session starts
      if (event.type === "session.created" && currentSessionId) {
        await performInitialQualityCheck(currentSessionId);
      }

      if (event.type === "session.idle") {
        await handleSessionIdleEvent();
      }

      if (event.type === "session.error") {
        await showToast("SonarQube: Analysis error occurred", "error");
      }
    }, "event"),

    /**
     * Tool execution hooks for configuration loading
     * NOTE: Pre-commit/pre-push blocking has been removed - use sonarqube tool directly
     */
    "tool.execute.before": safeAsync(async (input, _output) => {
      // Load config when sonarqube tool is called
      if (input.tool === "sonarqube") {
        await loadPluginConfig();
      }
    }, "tool.execute.before"),

    /**
     * Log tool execution results and trigger auto-analyze after code changes
     */
    "tool.execute.after": safeAsync(async (input, output) => {
      await logSonarQubeResult(input, output);
      await trackFileChanges(input, output);
      await handleGitOperations(input, output);
    }, "tool.execute.after"),

    /**
     * Preserve SonarQube context during session compaction
     */
    "experimental.session.compacting": safeAsync(async (_input, output) => {
      const context = buildCompactionContext();
      if (context) {
        output.context.push(context);
      }
    }, "experimental.session.compacting"),

    /**
     * Inject SonarQube quality context into system prompt
     * This ensures the agent is always aware of code quality status
     */
    "experimental.chat.system.transform": safeAsync(async (_input, output) => {
      const systemContext = await buildSystemTransformContext(_input);
      if (systemContext) {
        output.system.push(systemContext);
      }
    }, "experimental.chat.system.transform"),

    /**
     * Custom tools provided by this plugin
     */
    tool: {
      sonarqube: tool({
        description: `Run SonarQube code analysis and get quality metrics.

Actions:
- setup: Initialize project (auto-creates on SonarQube if needed)
- analyze: Run full analysis and get issues
- issues: Get all current issues
- newissues: Get only issues in NEW code (Clean as You Code)
- worstfiles: Show files with most issues (prioritize refactoring)
- status: Get quality gate status and metrics
- validate: Check if project meets enterprise quality standards
- hotspots: Get security hotspots that need review
- reviewhotspot: Review/resolve security hotspots (mark as SAFE, FIXED, or ACKNOWLEDGED)
- duplications: Find code duplications across the project
- rule: Explain a specific SonarQube rule
- history: Show past analysis history
- profile: Show quality profile configuration
- branches: Show branch analysis status
- metrics: Show detailed code metrics

Example usage:
- sonarqube({ action: "setup" }) - Initialize project
- sonarqube({ action: "analyze", fix: true }) - Run analysis with fix suggestions
- sonarqube({ action: "newissues" }) - Issues only in your recent changes
- sonarqube({ action: "worstfiles" }) - Files needing most attention
- sonarqube({ action: "issues", severity: "critical" }) - Get critical+ issues
- sonarqube({ action: "status" }) - Check quality gate status
- sonarqube({ action: "hotspots" }) - List security hotspots
- sonarqube({ action: "reviewhotspot", resolution: "SAFE" }) - Bulk-review all hotspots as SAFE
- sonarqube({ action: "reviewhotspot", hotspotKey: "abc123", resolution: "SAFE", comment: "No risk" }) - Review single hotspot`,

        args: {
          action: tool.schema
            .enum(["analyze", "issues", "newissues", "status", "init", "setup", "validate", "hotspots", "reviewhotspot", "duplications", "rule", "history", "profile", "branches", "metrics", "worstfiles"])
            .describe("Action to perform"),
          scope: tool.schema
            .enum(["all", "new", "changed"])
            .optional()
            .describe("Scope of analysis"),
          severity: tool.schema
            .enum(["blocker", "critical", "major", "minor", "info", "all"])
            .optional()
            .describe("Filter issues by minimum severity"),
          fix: tool.schema
            .boolean()
            .optional()
            .describe("Include fix suggestions in response"),
          projectKey: tool.schema
            .string()
            .optional()
            .describe("Override project key"),
          force: tool.schema
            .boolean()
            .optional()
            .describe("Force re-initialization"),
          ruleKey: tool.schema
            .string()
            .optional()
            .describe("Rule key to explain (e.g., 'typescript:S1234')"),
          branch: tool.schema
            .string()
            .optional()
            .describe("Branch name for multi-branch projects"),
          hotspotKey: tool.schema
            .string()
            .optional()
            .describe("Hotspot key (UUID) to review. If omitted with reviewhotspot action, all pending hotspots are bulk-reviewed."),
          resolution: tool.schema
            .string()
            .optional()
            .describe("Hotspot review resolution: SAFE, FIXED, or ACKNOWLEDGED"),
          comment: tool.schema
            .string()
            .optional()
            .describe("Review comment explaining the decision"),
        },

        async execute(args, _ctx: ToolContext): Promise<string> {
          const result = await executeSonarQubeTool(
            {
              action: args.action as any,
              scope: args.scope ?? "all",
              severity: args.severity ?? "all",
              fix: args.fix ?? false,
              projectKey: args.projectKey,
              force: args.force ?? false,
              ruleKey: args.ruleKey,
              branch: args.branch,
              hotspotKey: args.hotspotKey,
              resolution: args.resolution as any,
              comment: args.comment,
            },
            {
              directory: getDirectory(),
              config: pluginConfig,
            }
          );

          // Update last analysis result if this was an analysis
          if (args.action === "analyze" || args.action === "status") {
            const parsedResult = parseAnalysisResult(result);
            if (parsedResult) {
              lastAnalysisResult = parsedResult;
            }
            // Invalidate transform cache so next message gets fresh data
            transformCacheMap.clear();
          }

          return result;
        },
      }),
    },
  };

  return returnHooks;
};

// Default export for OpenCode plugin loading
export default SonarQubePlugin;

// =============================================================================
// CLI SUPPORT
// CLI functionality is in src/cli.ts to avoid OpenCode loading CLI exports as plugins
// =============================================================================

import { executeCLI } from "./cli.ts";

/**
 * CLI entry point
 * Only run CLI when explicitly invoked via command line, not when loaded as a plugin
 */
const isDirectCLI = import.meta.main && process.argv[1]?.includes("index.ts");
if (isDirectCLI) {
  await executeCLI();
}
// test Sun Jan 25 14:33:48 CET 2026
