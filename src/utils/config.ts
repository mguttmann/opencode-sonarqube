/**
 * Configuration utilities for the SonarQube plugin
 */

import { SonarQubeConfigSchema, type SonarQubeConfig } from "../types/index.ts";
import { createNoopLogger } from "./logger.ts";

// No-op logger (debug logging removed for production)
const configLogger = createNoopLogger();

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<SonarQubeConfig> = {
  level: "enterprise",
  autoAnalyze: true,
  newCodeDefinition: "previous_version",
  // NOTE: sources intentionally omitted - auto-detected by detectSourceDirectories()
};

/**
 * Load and validate SonarQube configuration
 * Reads from opencode.json or environment variables
 */
export function loadConfig(rawConfig?: Record<string, unknown>): SonarQubeConfig | null {
  configLogger.info(">>> loadConfig called", { hasRawConfig: !!rawConfig });
  
  // First, try to get from environment variables
  const envUrl = process.env["SONAR_HOST_URL"];
  const envUser = process.env["SONAR_USER"];
  const envPassword = process.env["SONAR_PASSWORD"];
  
  configLogger.info("Environment variables", { 
    hasEnvUrl: !!envUrl, 
    hasEnvUser: !!envUser, 
    hasEnvPassword: !!envPassword,
    envUrl: envUrl ? `${envUrl.substring(0, 20)}...` : undefined
  });

  // Merge environment variables with provided config
  const configToValidate = {
    ...DEFAULT_CONFIG,
    ...rawConfig,
    // Environment variables take precedence
    ...(envUrl && { url: envUrl }),
    ...(envUser && { user: envUser }),
    ...(envPassword && { password: envPassword }),
  };

  // Check if we have the minimum required config
  if (!configToValidate.url || !configToValidate.user || !configToValidate.password) {
    configLogger.warn("Missing required config", { 
      hasUrl: !!configToValidate.url, 
      hasUser: !!configToValidate.user, 
      hasPassword: !!configToValidate.password 
    });
    return null;
  }

  // Validate against schema
  const result = SonarQubeConfigSchema.safeParse(configToValidate);

  if (!result.success) {
    configLogger.error("Config validation failed", { errors: result.error.format() });
    return null;
  }

  configLogger.info("<<< loadConfig success", { url: result.data.url, level: result.data.level });
  return result.data;
}

/**
 * Derive project key from directory
 * Priority: package.json name > directory name > cwd
 */
export async function deriveProjectKey(directory: string): Promise<string> {
  // 1. Try package.json name
  try {
    const packageJsonPath = `${directory}/package.json`;
    const packageJson = await Bun.file(packageJsonPath).json();
    if (packageJson.name) {
      return packageJson.name;
    }
  } catch {
    // No package.json or couldn't read it
  }

  // 2. Use directory name (but not if it's root "/")
  const dirName = directory.split("/").pop();
  if (dirName && dirName.length > 0) {
    return dirName;
  }

  /* c8 ignore start */
  // 3. Fallback to cwd if directory is "/" or empty
  const cwd = process.cwd();
  if (cwd && cwd !== "/") {
    const cwdName = cwd.split("/").pop();
    if (cwdName && cwdName.length > 0) {
      return cwdName;
    }
  }

  // 4. Last resort - generate a unique name
  return `project-${Date.now()}`;
  /* c8 ignore stop */
}

/**
 * Get project key from various sources
 * Priority: config > package.json > directory name
 */
export async function getProjectKey(
  config?: SonarQubeConfig,
  directory?: string
): Promise<string> {
  // 1. From config
  if (config?.projectKey) {
    return config.projectKey;
  }

  // 2. From package.json
  try {
    const packageJsonPath = directory
      ? `${directory}/package.json`
      : "./package.json";
    const packageJson = await Bun.file(packageJsonPath).json();
    if (packageJson.name) {
      // Convert to valid SonarQube project key (lowercase, no special chars except - and _)
      return sanitizeProjectKey(packageJson.name);
    }
  } catch {
    // No package.json or couldn't read it
  }

  // 3. From directory name
  if (directory) {
    const dirName = directory.split("/").pop() ?? "project";
    return sanitizeProjectKey(dirName);
  }

  // 4. From current directory
  const cwd = process.cwd();
  const currentDirName = cwd.split("/").pop() ?? "project";
  return sanitizeProjectKey(currentDirName);
}

/**
 * Get project name from various sources
 */
export async function getProjectName(
  config?: SonarQubeConfig,
  directory?: string
): Promise<string> {
  // 1. From config
  if (config?.projectName) {
    return config.projectName;
  }

  // 2. From package.json
  try {
    const packageJsonPath = directory
      ? `${directory}/package.json`
      : "./package.json";
    const packageJson = await Bun.file(packageJsonPath).json();
    if (packageJson.name) {
      return packageJson.name;
    }
  } catch {
    // No package.json or couldn't read it
  }

  // 3. From project key
  return await getProjectKey(config, directory);
}

/**
 * Sanitize a string to be a valid SonarQube project key
 * - Must be lowercase
 * - Only alphanumeric, - and _ allowed
 * - Max 400 characters
 */
export function sanitizeProjectKey(input: string): string {
  const sanitized = input
    .toLowerCase()
    .replaceAll(/[^a-z0-9-_]/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/(?:^-)|(?:-$)/g, "")
    .slice(0, 400);
  return sanitized || "project";
}

/**
 * Get severity threshold based on analysis level
 */
export function getSeverityThreshold(level: SonarQubeConfig["level"]): string[] {
  switch (level) {
    case "enterprise":
      // All severities
      return ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"];
    case "standard":
      // Major and above
      return ["BLOCKER", "CRITICAL", "MAJOR"];
    case "relaxed":
      // Only critical issues
      return ["BLOCKER", "CRITICAL"];
    case "off":
      // No analysis
      return [];
    default:
      return ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"];
  }
}

/**
 * Check if an issue should cause a build failure based on level
 */
export function shouldFailBuild(
  level: SonarQubeConfig["level"],
  severity: string
): boolean {
  switch (level) {
    case "enterprise":
      // Fail on blocker, critical, or major
      return ["BLOCKER", "CRITICAL", "MAJOR"].includes(severity);
    case "standard":
      // Fail on blocker or critical
      return ["BLOCKER", "CRITICAL"].includes(severity);
    case "relaxed":
      // Only fail on blocker
      return severity === "BLOCKER";
    case "off":
      return false;
    default:
      return false;
  }
}
