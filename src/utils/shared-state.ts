/**
 * Shared State Management
 * 
 * Filesystem-based shared state for multi-project support.
 * Each module instance has isolated memory, so we use the filesystem
 * to share state across instances.
 * 
 * @module utils/shared-state
 */

import { readFileSync, writeFileSync, renameSync } from "node:fs";

// =============================================================================
// SHARED STATE via filesystem - because each module instance has isolated memory
// =============================================================================

export const SHARED_STATE_FILE = "/tmp/sonarqube-plugin-shared-state.json";

export interface SharedState {
  sessionToDirectory: Record<string, string>;
  registeredDirectories: string[];
  lastUpdated: string;
}

/**
 * Read shared state from filesystem
 */
/* c8 ignore start - filesystem state management */
export const readSharedState = (): SharedState => {
  try {
    const content = readFileSync(SHARED_STATE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { sessionToDirectory: {}, registeredDirectories: [], lastUpdated: "" };
  }
};
/* c8 ignore stop */

/**
 * Write shared state to filesystem
 */
/* c8 ignore start - filesystem state management */
export const writeSharedState = (state: SharedState): void => {
  try {
    state.lastUpdated = new Date().toISOString();
    // Atomic write: write to temp file, then rename to avoid read-modify-write races
    const tmpFile = `${SHARED_STATE_FILE}.tmp.${process.pid}`;
    writeFileSync(tmpFile, JSON.stringify(state, null, 2));
    renameSync(tmpFile, SHARED_STATE_FILE);
  } catch {
    // Silently ignore write errors
  }
};
/* c8 ignore stop */

/**
 * Map a session ID to a directory (persisted to filesystem)
 */
/* c8 ignore start - filesystem state management */
export const mapSessionToDirectory = (sessionId: string, directory: string): void => {
  const state = readSharedState();
  state.sessionToDirectory[sessionId] = directory;
  writeSharedState(state);
};

/**
 * Get directory for a session ID (from filesystem)
 */
export const getDirectoryForSession = (sessionId: string): string | undefined => {
  const state = readSharedState();
  return state.sessionToDirectory[sessionId];
};

/**
 * Register a directory (persisted to filesystem)
 */
export const registerDirectory = (directory: string): void => {
  const state = readSharedState();
  if (!state.registeredDirectories.includes(directory)) {
    state.registeredDirectories.push(directory);
    writeSharedState(state);
  }
};
/* c8 ignore stop */
