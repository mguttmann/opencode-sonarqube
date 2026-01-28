/**
 * Project State Manager
 * Manages local project state stored in .sonarqube/project.json
 */

import { type ProjectState, ProjectStateSchema } from "../types/index.ts";
import { createNoopLogger } from "./logger.ts";

// No-op logger (debug logging removed for production)
const logger = createNoopLogger();
const STATE_DIR = ".sonarqube";
const STATE_FILE = "project.json";

/**
 * Get the state file path for a directory
 */
function getStatePath(directory: string): string {
  return `${directory}/${STATE_DIR}/${STATE_FILE}`;
}

/**
 * Get the state directory path
 */
function getStateDir(directory: string): string {
  return `${directory}/${STATE_DIR}`;
}

/**
 * Check if project state exists
 */
export async function hasProjectState(directory: string): Promise<boolean> {
  const statePath = getStatePath(directory);
  return Bun.file(statePath).exists();
}

/**
 * Load project state from disk
 */
export async function loadProjectState(directory: string): Promise<ProjectState | null> {
  const statePath = getStatePath(directory);
  
  const exists = await Bun.file(statePath).exists();
  if (!exists) {
    return null;
  }

  try {
    const content = await Bun.file(statePath).text();
    const data = JSON.parse(content);
    const state = ProjectStateSchema.parse(data);
    return state;
  } catch (error) {
    logger.error("Failed to load project state", { 
      error: error instanceof Error ? error.message : String(error),
      statePath 
    });
    return null;
  }
}

/**
 * Save project state to disk
 */
export async function saveProjectState(
  directory: string,
  state: ProjectState
): Promise<void> {
  const stateDir = getStateDir(directory);
  const statePath = getStatePath(directory);

  // Ensure directory exists
  const { mkdir } = await import("node:fs/promises");
  await mkdir(stateDir, { recursive: true });

  // Write state file
  const content = JSON.stringify(state, null, 2);
  await Bun.write(statePath, content);
  
  logger.info("Saved project state", { projectKey: state.projectKey });
}

/**
 * Update project state (partial update)
 */
export async function updateProjectState(
  directory: string,
  updates: Partial<ProjectState>
): Promise<ProjectState | null> {
  const existing = await loadProjectState(directory);
  if (!existing) {
    logger.warn("Cannot update non-existent state");
    return null;
  }

  const updated: ProjectState = {
    ...existing,
    ...updates,
  };

  await saveProjectState(directory, updated);
  return updated;
}

/**
 * Delete project state
 */
export async function deleteProjectState(directory: string): Promise<boolean> {
  const statePath = getStatePath(directory);
  
  const exists = await Bun.file(statePath).exists();
  if (!exists) {
    return false;
  }

  try {
    await Bun.write(statePath, ""); // Clear file
    const { unlink } = await import("node:fs/promises");
    await unlink(statePath);
    logger.info("Deleted project state", { directory });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create initial project state
 */
export function createInitialState(options: {
  projectKey: string;
  projectToken: string;
  tokenName: string;
  languages: string[];
  qualityGate?: string;
}): ProjectState {
  return {
    projectKey: options.projectKey,
    projectToken: options.projectToken,
    tokenName: options.tokenName,
    initializedAt: new Date().toISOString(),
    languages: options.languages,
    qualityGate: options.qualityGate,
    setupComplete: true,
  };
}

/**
 * Ensure .sonarqube directory is in .gitignore
 */
export async function ensureGitignore(directory: string): Promise<void> {
  const gitignorePath = `${directory}/.gitignore`;
  const entry = ".sonarqube/";

  const exists = await Bun.file(gitignorePath).exists();
  
  if (!exists) {
    // Create .gitignore with our entry
    await Bun.write(gitignorePath, `# SonarQube local state\n${entry}\n`);
    logger.info("Created .gitignore with SonarQube exclusion");
    return;
  }

  // Check if entry exists
  const content = await Bun.file(gitignorePath).text();
  if (content.includes(entry) || content.includes(".sonarqube")) {
    return; // Already excluded
  }

  // Append entry
  const newContent = content.endsWith("\n") 
    ? content + `\n# SonarQube local state\n${entry}\n`
    : content + `\n\n# SonarQube local state\n${entry}\n`;
  
  await Bun.write(gitignorePath, newContent);
  logger.info("Added SonarQube exclusion to .gitignore");
}
