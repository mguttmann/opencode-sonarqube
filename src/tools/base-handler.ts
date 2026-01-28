/**
 * Base Handler Context for SonarQube Tool Handlers
 *
 * Provides a unified context object that all handlers can use instead of
 * receiving multiple individual parameters. This simplifies handler signatures
 * and ensures consistent access to common dependencies.
 */

import { createSonarQubeAPI, type SonarQubeAPI } from "../api/index.ts";
import type { SonarQubeConfig, ProjectState } from "../types/index.ts";

/**
 * Handler context containing all dependencies needed by handlers
 */
export interface HandlerContext {
  /** SonarQube server configuration */
  config: SonarQubeConfig;
  /** Project state with token and project key */
  state: ProjectState;
  /** SonarQube project key (may be overridden from args) */
  projectKey: string;
  /** Working directory for the project */
  directory: string;
  /** Initialized SonarQube API client */
  api: SonarQubeAPI;
}

/**
 * Handler function signature for typed handlers
 */
export type Handler<TArgs = unknown, TResult = string> = (
  ctx: HandlerContext,
  args: TArgs
) => Promise<TResult>;

/**
 * Create a handler context with initialized API client
 *
 * @param config - SonarQube server configuration
 * @param state - Project state containing token
 * @param projectKey - Project key for SonarQube operations
 * @param directory - Working directory path
 * @returns HandlerContext with initialized API
 *
 * @example
 * ```typescript
 * const ctx = createHandlerContext(config, state, projectKey, directory);
 * const issues = await ctx.api.issues.search({ projectKey: ctx.projectKey });
 * ```
 */
export function createHandlerContext(
  config: SonarQubeConfig,
  state: ProjectState,
  projectKey: string,
  directory: string
): HandlerContext {
  return {
    config,
    state,
    projectKey,
    directory,
    api: createSonarQubeAPI(config, state),
  };
}
