/**
 * SonarQube Projects API
 * Handles project creation, search, and management
 */

import type { SonarQubeClient } from "./client.ts";
import type {
  ProjectCreateResponse,
  ProjectSearchResponse,
  TokenGenerateResponse,
} from "../types/index.ts";
import { ProjectNotFoundError } from "../types/index.ts";
import { Logger } from "../utils/logger.ts";
import { BaseAPI } from "./base-api.ts";

export class ProjectsAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-projects", logger);
  }

  /**
   * Create a new project in SonarQube
   */
  async create(options: {
    projectKey: string;
    name: string;
    mainBranch?: string;
    visibility?: "public" | "private";
  }): Promise<ProjectCreateResponse> {
    this.logger.info(`Creating project: ${options.projectKey}`);

    return this.client.post<ProjectCreateResponse>("/api/projects/create", {
      project: options.projectKey,
      name: options.name,
      mainBranch: options.mainBranch ?? "main",
      visibility: options.visibility ?? "private",
    });
  }

  /**
   * Search for projects
   */
  async search(options?: {
    projects?: string;
    query?: string;
    pageSize?: number;
    page?: number;
  }): Promise<ProjectSearchResponse> {
    return this.client.get<ProjectSearchResponse>("/api/projects/search", {
      projects: options?.projects,
      q: options?.query,
      ps: options?.pageSize ?? 100,
      p: options?.page ?? 1,
    });
  }

  /**
   * Check if a project exists
   */
  async exists(projectKey: string): Promise<boolean> {
    try {
      const response = await this.search({ projects: projectKey });
      return response.components.some((c) => c.key === projectKey);
    } catch {
      return false;
    }
  }

  /**
   * Get project details
   */
  async get(projectKey: string): Promise<ProjectSearchResponse["components"][0] | null> {
    const response = await this.search({ projects: projectKey });
    return response.components.find((c) => c.key === projectKey) ?? null;
  }

  /**
   * Delete a project
   */
  async delete(projectKey: string): Promise<void> {
    this.logger.warn(`Deleting project: ${projectKey}`);
    await this.client.post("/api/projects/delete", { project: projectKey });
  }

  /**
   * Generate a project analysis token
   */
  async generateToken(options: {
    projectKey: string;
    tokenName?: string;
    expirationDate?: string;
  }): Promise<TokenGenerateResponse> {
    const tokenName = options.tokenName ?? `opencode-${options.projectKey}-${Date.now()}`;
    
    this.logger.info(`Generating token for project: ${options.projectKey}`);

    return this.client.post<TokenGenerateResponse>("/api/user_tokens/generate", {
      name: tokenName,
      type: "PROJECT_ANALYSIS_TOKEN",
      projectKey: options.projectKey,
      expirationDate: options.expirationDate,
    });
  }

  /**
   * Revoke a token by name
   */
  async revokeToken(tokenName: string): Promise<void> {
    this.logger.info(`Revoking token: ${tokenName}`);
    await this.client.post("/api/user_tokens/revoke", { name: tokenName });
  }

  /**
   * Set the quality gate for a project
   */
  async setQualityGate(projectKey: string, gateName: string): Promise<void> {
    // First, get the quality gate ID
    const gatesResponse = await this.client.get<{
      qualitygates: Array<{ id: number; name: string }>;
    }>("/api/qualitygates/list");

    const gate = gatesResponse.qualitygates.find((g) => g.name === gateName);
    if (!gate) {
      this.logger.warn(`Quality gate '${gateName}' not found, using default`);
      return;
    }

    await this.client.post("/api/qualitygates/select", {
      projectKey,
      gateId: gate.id,
    });

    this.logger.info(`Set quality gate '${gateName}' for project ${projectKey}`);
  }

  /**
   * Ensure a project exists, creating it if necessary
   */
  async ensureExists(options: {
    projectKey: string;
    name: string;
    mainBranch?: string;
    qualityGate?: string;
  }): Promise<{ created: boolean; project: ProjectSearchResponse["components"][0] }> {
    const exists = await this.exists(options.projectKey);

    if (exists) {
      const project = await this.get(options.projectKey);
      if (!project) {
        throw ProjectNotFoundError(options.projectKey);
      }
      return { created: false, project };
    }

    // Create the project
    const response = await this.create({
      projectKey: options.projectKey,
      name: options.name,
      mainBranch: options.mainBranch,
    });

    // Set quality gate if specified
    if (options.qualityGate) {
      try {
        await this.setQualityGate(options.projectKey, options.qualityGate);
      } catch (error) {
        this.logger.warn(`Failed to set quality gate: ${error}`);
      }
    }

    return {
      created: true,
      project: {
        key: response.project.key,
        name: response.project.name,
        qualifier: response.project.qualifier,
        visibility: "private",
      },
    };
  }
}
