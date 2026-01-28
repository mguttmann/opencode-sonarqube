/**
 * SonarQube Bootstrap Module
 * Handles first-run initialization and project setup
 */

import {
  type SonarQubeConfig,
  type ProjectState,
  type BootstrapResult,
  type TokenGenerateResponse,
  type QualityGatesListResponse,
  SetupError,
} from "../types/index.ts";
import { SonarQubeClient, createClientWithCredentials, createClientWithToken } from "../api/client.ts";
import { ProjectsAPI } from "../api/projects.ts";
import { detectProjectType } from "../scanner/config.ts";
import {
  hasProjectState,
  loadProjectState,
  saveProjectState,
  createInitialState,
  ensureGitignore,
} from "../utils/state.ts";
import { sanitizeProjectKey, deriveProjectKey } from "../utils/config.ts";
import { createNoopLogger } from "../utils/logger.ts";

// No-op logger (debug logging removed for production)
const logger = createNoopLogger();

/**
 * Quality gate configurations based on analysis level
 */
const QUALITY_GATE_MAPPING: Record<string, string> = {
  enterprise: "Sonar way",
  standard: "Sonar way",
  relaxed: "Sonar way",
  off: "Sonar way",
};

/**
 * Bootstrap options
 */
export interface BootstrapOptions {
  config: SonarQubeConfig;
  directory: string;
  force?: boolean;
}

/**
 * Check if bootstrap is needed
 */
export async function needsBootstrap(directory: string): Promise<boolean> {
  logger.info(">>> needsBootstrap called", { directory });
  
  const hasState = await hasProjectState(directory);
  logger.info("hasProjectState result", { hasState, directory });
  
  if (!hasState) {
    logger.info("<<< needsBootstrap: true (no state file)");
    return true;
  }

  const state = await loadProjectState(directory);
  const needsBoot = !state?.setupComplete;
  logger.info("<<< needsBootstrap result", { 
    needsBoot, 
    hasState: !!state,
    setupComplete: state?.setupComplete,
    projectKey: state?.projectKey
  });
  
  return needsBoot;
}

/**
 * Get existing project state or null
 */
export async function getProjectState(directory: string): Promise<ProjectState | null> {
  return loadProjectState(directory);
}

/**
 * Create a client using project token from state
 */
export async function createAuthenticatedClient(
  config: SonarQubeConfig,
  directory: string
): Promise<SonarQubeClient | null> {
  const state = await loadProjectState(directory);
  if (!state?.projectToken) {
    return null;
  }

  return createClientWithToken(config.url, state.projectToken);
}

/**
 * Generate a unique token name using crypto for security
 */
function generateTokenName(projectKey: string): string {
  const timestamp = Date.now();
  // Use crypto.randomUUID() for secure random generation (not Math.random)
  const uuid = crypto.randomUUID().split("-")[0];
  return `opencode-${projectKey}-${timestamp}-${uuid}`;
}

/**
 * Check if directory is valid
 */
function isValidDirectory(dir: string | undefined): boolean {
  return Boolean(dir && dir !== "/" && dir !== "." && dir.length >= 2);
}

/**
 * Try to resolve directory from import.meta.url
 */
/* c8 ignore start */
function resolveDirectoryFromImportMeta(): string | null {
  try {
    const pluginUrl = import.meta.url;
    const pluginPath = decodeURIComponent(pluginUrl.replace("file://", ""));
    const pathParts = pluginPath.split("/");
    const nodeModulesIndex = pathParts.indexOf("node_modules");
    if (nodeModulesIndex > 0) {
      const projectPath = pathParts.slice(0, nodeModulesIndex).join("/");
      if (isValidDirectory(projectPath)) {
        return projectPath;
      }
    }
  } catch { /* ignore */ }
  return null;
}
/* c8 ignore stop */

/**
 * Ensure plugins are enabled on the server (fix for SonarQube 26.x)
 * SonarQube 26.x has sonar.plugins.downloadOnlyRequired=true by default,
 * which prevents language plugins from loading during analysis.
 */
async function ensurePluginsEnabled(client: SonarQubeClient): Promise<void> {
  try {
    // Check current setting
    const response = await client.get<{ settings: Array<{ key: string; value: string }> }>(
      "/api/settings/values",
      { keys: "sonar.plugins.downloadOnlyRequired" }
    );
    
    const setting = response.settings.find(s => s.key === "sonar.plugins.downloadOnlyRequired");
    
    // If set to true, change it to false so all language plugins load
    /* c8 ignore start - requires specific server state */
    if (setting?.value === "true") {
      await client.post("/api/settings/set", {
        key: "sonar.plugins.downloadOnlyRequired",
        value: "false",
      });
      logger.info("Enabled full plugin loading on server (sonar.plugins.downloadOnlyRequired=false)");
    }
    /* c8 ignore stop */
  } catch {
    // Setting might not exist or we don't have permission - that's okay
    logger.warn("Could not check/set plugin loading setting");
  }
}

/**
 * Generate analysis token, falling back to global token if project token not available
 */
async function generateAnalysisToken(
  client: SonarQubeClient,
  tokenName: string,
  projectKey: string
): Promise<TokenGenerateResponse> {
  try {
    return await client.post<TokenGenerateResponse>(
      "/api/user_tokens/generate",
      { name: tokenName, type: "PROJECT_ANALYSIS_TOKEN", projectKey }
    );
  } catch {
    logger.warn("PROJECT_ANALYSIS_TOKEN not available, using GLOBAL_ANALYSIS_TOKEN");
    return await client.post<TokenGenerateResponse>(
      "/api/user_tokens/generate",
      { name: tokenName, type: "GLOBAL_ANALYSIS_TOKEN" }
    );
  }
}

/**
 * Bootstrap the SonarQube integration for a project
 * This is called on first run to set up everything
 */
export async function bootstrap(options: BootstrapOptions): Promise<BootstrapResult> {
  let { config, directory, force = false } = options;

  logger.info("Starting bootstrap", { directory, projectKey: config.projectKey || "(auto)" });

  // Resolve directory if invalid
  /* c8 ignore start */
  if (!isValidDirectory(directory)) {
    const resolved = resolveDirectoryFromImportMeta();
    if (resolved) {
      directory = resolved;
    }
  }

  // Validate directory
  if (!isValidDirectory(directory)) {
    return {
      success: false, projectKey: "", projectToken: "", qualityGate: "",
      languages: [], message: `Invalid directory: ${directory}`, isNewProject: false,
    };
  }
  /* c8 ignore stop */

  // Check if already bootstrapped
  if (!force) {
    const existingState = await loadProjectState(directory);
    if (existingState?.setupComplete) {
      logger.info("Project already bootstrapped", { projectKey: existingState.projectKey });
      return {
        success: true, projectKey: existingState.projectKey,
        projectToken: existingState.projectToken, qualityGate: existingState.qualityGate,
        languages: existingState.languages, message: "Project already configured", isNewProject: false,
      };
    }
  }

  // Connect to SonarQube
  const adminClient = createClientWithCredentials(config.url, config.user, config.password);
  const health = await adminClient.healthCheck();
  if (!health.healthy) {
    throw SetupError(`Cannot connect to SonarQube: ${health.error}`);
  }
  logger.info("Connected to SonarQube", { version: health.version });

  // Ensure plugins are loaded (fix for SonarQube 26.x)
  await ensurePluginsEnabled(adminClient);

  // Detect project and create if needed
  const detection = await detectProjectType(directory);
  const projectKey = config.projectKey || sanitizeProjectKey(await deriveProjectKey(directory));
  const projectName = config.projectName || projectKey;
  const projectsApi = new ProjectsAPI(adminClient);
  
  const exists = await projectsApi.exists(projectKey);
  const isNewProject = !exists;
  if (isNewProject) {
    await projectsApi.create({ projectKey, name: projectName, visibility: "private" });
    logger.info("Created new project", { projectKey });
  }

  // Generate token and configure project
  const tokenName = generateTokenName(projectKey);
  const tokenResponse = await generateAnalysisToken(adminClient, tokenName, projectKey);
  
  const qualityGateName = config.qualityGate ?? QUALITY_GATE_MAPPING[config.level];
  try {
    await setProjectQualityGate(adminClient, projectKey, qualityGateName);
  } catch (error) {
    logger.warn("Failed to set quality gate", { error: String(error) });
  }

  await configureProjectSettings(adminClient, projectKey, detection.languages, config);

  // Save state
  const state = createInitialState({
    projectKey, projectToken: tokenResponse.token, tokenName,
    languages: detection.languages, qualityGate: qualityGateName,
  });
  await saveProjectState(directory, state);
  await ensureGitignore(directory);

  logger.info("Bootstrap complete", { projectKey, isNewProject });
  return {
    success: true, projectKey, projectToken: tokenResponse.token,
    qualityGate: qualityGateName, languages: detection.languages,
    message: isNewProject ? `Created new project '${projectKey}'` : `Configured existing project '${projectKey}'`,
    isNewProject,
  };
}

/**
 * Set the quality gate for a project
 */
async function setProjectQualityGate(
  client: SonarQubeClient,
  projectKey: string,
  qualityGateName: string
): Promise<void> {
  // Get available quality gates
  const gatesResponse = await client.get<QualityGatesListResponse>("/api/qualitygates/list");
  
  const gate = gatesResponse.qualitygates.find(g => g.name === qualityGateName);
  if (!gate) {
    logger.warn(`Quality gate '${qualityGateName}' not found, using default`);
    return;
  }

  await client.post("/api/qualitygates/select", {
    projectKey,
    gateId: gate.id,
  });
}

/**
 * Configure project-specific settings based on detected languages
 */
async function configureProjectSettings(
  client: SonarQubeClient,
  projectKey: string,
  languages: string[],
  config: SonarQubeConfig
): Promise<void> {
  const settings: Array<{ key: string; value: string }> = [];

  // Common settings
  settings.push({ key: "sonar.sourceEncoding", value: "UTF-8" });

  // TypeScript/JavaScript settings
  if (languages.includes("typescript") || languages.includes("javascript")) {
    settings.push({ key: "sonar.javascript.node.maxspace", value: "4096" });
  }

  // Set sources
  if (config.sources) {
    settings.push({ key: "sonar.sources", value: config.sources });
  }

  // Set tests
  if (config.tests) {
    settings.push({ key: "sonar.tests", value: config.tests });
  }

  // Set exclusions
  if (config.exclusions) {
    settings.push({ key: "sonar.exclusions", value: config.exclusions });
  }

  // Apply settings
  for (const setting of settings) {
    try {
      await client.post("/api/settings/set", {
        key: setting.key,
        value: setting.value,
        component: projectKey,
      });
    } catch {
      // Some settings might not be available, continue
    }
  }
}

/**
 * Re-initialize an existing project (force re-bootstrap)
 */
export async function reinitialize(options: BootstrapOptions): Promise<BootstrapResult> {
  return bootstrap({ ...options, force: true });
}

/**
 * Disconnect and clean up local state
 */
export async function disconnect(directory: string): Promise<void> {
  const state = await loadProjectState(directory);
  if (!state) {
    return;
  }

  // Note: We don't delete the token on SonarQube server
  // as the user might want to reconnect later
  
  const { deleteProjectState } = await import("../utils/state.ts");
  await deleteProjectState(directory);
  
  logger.info("Disconnected from SonarQube", { projectKey: state.projectKey });
}
