/**
 * Project State Manager
 * Manages local project state stored in .sonarqube/project.json
 * Includes versioning, migration, and auto-repair capabilities
 */

import { type ProjectState, ProjectStateSchema } from "../types/index.ts";
import { createNoopLogger } from "./logger.ts";

// No-op logger (debug logging removed for production)
const logger = createNoopLogger();
const STATE_DIR = ".sonarqube";
const STATE_FILE = "project.json";
const BACKUP_FILE = "project.json.backup";

/**
 * Current state schema version - increment when schema changes
 */
export const STATE_VERSION = 2;

/**
 * Extended state with version for migration
 */
interface VersionedState extends ProjectState {
  _version?: number;
}

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
 * Load project state from disk with auto-repair and migration
 */
export async function loadProjectState(directory: string): Promise<ProjectState | null> {
  const statePath = getStatePath(directory);
  
  const exists = await Bun.file(statePath).exists();
  if (!exists) {
    return null;
  }

  try {
    const content = await Bun.file(statePath).text();
    
    // Handle empty or whitespace-only content
    if (!content.trim()) {
      logger.warn("Empty state file detected, removing");
      await deleteProjectState(directory);
      return null;
    }
    
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(content);
    } catch (parseError) {
      // JSON is corrupt - log the error and try to recover from backup
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      logger.error("Corrupt JSON in state file, attempting backup recovery", { error: errorMessage });
      const recovered = await recoverFromBackup(directory);
      if (recovered) {
        return recovered;
      }
      // No backup available - delete corrupt file
      await deleteProjectState(directory);
      return null;
    }
    
    // Try to validate with schema
    const validationResult = ProjectStateSchema.safeParse(data);
    
    if (validationResult.success) {
      // Valid state - migrate if needed and return
      const state = await migrateState(data as unknown as VersionedState, directory);
      return state;
    }
    
    // Schema validation failed - try to repair
    logger.warn("State validation failed, attempting repair", {
      errors: validationResult.error.format(),
    });
    
    const repairedState = await repairState(data, directory);
    if (repairedState) {
      logger.info("State successfully repaired");
      return repairedState;
    }
    
    // Could not repair - try backup
    logger.error("State repair failed, attempting backup recovery");
    const recovered = await recoverFromBackup(directory);
    if (recovered) {
      return recovered;
    }
    
    // No recovery possible
    logger.error("Failed to load project state - no recovery possible");
    return null;
  } catch (error) {
    logger.error("Failed to load project state", { 
      error: error instanceof Error ? error.message : String(error),
      statePath 
    });
    return null;
  }
}

/**
 * Migrate state from older versions to current version
 */
async function migrateState(data: VersionedState, directory: string): Promise<ProjectState> {
  const currentVersion = data._version ?? 1;
  
  if (currentVersion >= STATE_VERSION) {
    // Already at current version
    const { _version, ...state } = data;
    return state as ProjectState;
  }
  
  logger.info("Migrating state", { from: currentVersion, to: STATE_VERSION });
  
  let migratedData = { ...data };
  
  // Migration v1 -> v2: Add missing optional fields with defaults
  if (currentVersion < 2) {
    migratedData = {
      ...migratedData,
      languages: migratedData.languages ?? [],
      setupComplete: migratedData.setupComplete ?? true,
    };
  }
  
  // Add version marker
  migratedData._version = STATE_VERSION;
  
  // Save migrated state (with backup)
  const { _version, ...cleanState } = migratedData;
  const finalState = cleanState as ProjectState;
  
  // Create backup before saving migrated state
  await createBackup(directory);
  await saveProjectState(directory, finalState);
  
  logger.info("State migration complete");
  return finalState;
}

/**
 * Extract string field from data or return default
 */
function extractString(data: Record<string, unknown>, key: string, defaultValue?: string): string | undefined {
  const value = data[key];
  return (typeof value === "string" && value.length > 0) ? value : defaultValue;
}

/**
 * Extract boolean field from data or return default
 */
function extractBoolean(data: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
  const value = data[key];
  return typeof value === "boolean" ? value : defaultValue;
}

/**
 * Extract string array from data
 */
function extractStringArray(data: Record<string, unknown>, key: string): string[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Extract required project key, deriving from directory if needed
 */
function extractProjectKey(data: Record<string, unknown>, directory: string): string | null {
  const key = extractString(data, "projectKey");
  if (key) return key;
  
  const dirName = directory.split("/").pop();
  return (dirName && dirName.length > 0) ? dirName : null;
}

/**
 * Attempt to repair a corrupted/invalid state
 */
async function repairState(
  data: Record<string, unknown>,
  directory: string
): Promise<ProjectState | null> {
  await createBackup(directory);
  
  const projectKey = extractProjectKey(data, directory);
  const projectToken = extractString(data, "projectToken");
  
  // Token is essential - can't repair without it
  if (!projectKey || !projectToken) {
    return null;
  }
  
  const repaired: Partial<ProjectState> = {
    projectKey,
    projectToken,
    tokenName: extractString(data, "tokenName") ?? `opencode-${projectKey}-recovered`,
    initializedAt: extractString(data, "initializedAt") ?? new Date().toISOString(),
    languages: extractStringArray(data, "languages"),
    qualityGate: extractString(data, "qualityGate"),
    lastAnalysis: extractString(data, "lastAnalysis"),
    setupComplete: extractBoolean(data, "setupComplete", true),
  };
  
  const validationResult = ProjectStateSchema.safeParse(repaired);
  if (!validationResult.success) {
    logger.error("Repaired state still invalid", { errors: validationResult.error.format() });
    return null;
  }
  
  await saveProjectState(directory, validationResult.data);
  return validationResult.data;
}

/**
 * Create a backup of the current state file
 */
async function createBackup(directory: string): Promise<boolean> {
  const statePath = getStatePath(directory);
  const backupPath = `${directory}/${STATE_DIR}/${BACKUP_FILE}`;
  
  try {
    const exists = await Bun.file(statePath).exists();
    if (!exists) {
      return false;
    }
    
    const content = await Bun.file(statePath).text();
    await Bun.write(backupPath, content);
    logger.info("Created state backup");
    return true;
  } catch {
    logger.warn("Failed to create state backup");
    return false;
  }
}

/**
 * Attempt to recover state from backup file
 */
async function recoverFromBackup(directory: string): Promise<ProjectState | null> {
  const backupPath = `${directory}/${STATE_DIR}/${BACKUP_FILE}`;
  
  try {
    const exists = await Bun.file(backupPath).exists();
    if (!exists) {
      return null;
    }
    
    const content = await Bun.file(backupPath).text();
    if (!content.trim()) {
      return null;
    }
    
    const data = JSON.parse(content);
    const validationResult = ProjectStateSchema.safeParse(data);
    
    if (!validationResult.success) {
      return null;
    }
    
    // Backup is valid - restore it
    await saveProjectState(directory, validationResult.data);
    logger.info("State recovered from backup");
    return validationResult.data;
  } catch {
    return null;
  }
}

/**
 * Save project state to disk with automatic backup
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

  // Create backup of existing state before overwriting
  const existingFile = Bun.file(statePath);
  if (await existingFile.exists()) {
    try {
      const existingContent = await existingFile.text();
      if (existingContent.trim()) {
        const backupPath = `${stateDir}/${BACKUP_FILE}`;
        await Bun.write(backupPath, existingContent);
      }
    } catch {
      // Backup creation failed - continue anyway
    }
  }

  // Add version to state for future migrations
  const versionedState = { ...state, _version: STATE_VERSION };
  
  // Write state file
  const content = JSON.stringify(versionedState, null, 2);
  await Bun.write(statePath, content);
  
  logger.info("Saved project state", { projectKey: state.projectKey, version: STATE_VERSION });
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
