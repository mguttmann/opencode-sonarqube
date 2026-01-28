/**
 * SonarQube Project Analyses API
 * Provides access to analysis history
 */

import type { SonarQubeClient } from "./client.ts";
import { Logger } from "../utils/logger.ts";
import { BaseAPI } from "./base-api.ts";
import type { ProjectAnalysis, PagingResponse } from "./types.ts";

// Re-export types for backwards compatibility
export type { AnalysisEvent, ProjectAnalysis } from "./types.ts";

/**
 * Analyses search response
 */
interface AnalysesSearchResponse {
  paging: PagingResponse;
  analyses: ProjectAnalysis[];
}

export class ProjectAnalysesAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-analyses", logger);
  }

  /**
   * Get analysis history for a project
   */
  async getAnalyses(options: {
    projectKey: string;
    branch?: string;
    category?: "VERSION" | "OTHER" | "QUALITY_PROFILE" | "QUALITY_GATE" | "DEFINITION_CHANGE";
    from?: string;
    to?: string;
    pageSize?: number;
  }): Promise<ProjectAnalysis[]> {
    this.logger.info(`>>> getAnalyses called`, { 
      projectKey: options.projectKey, 
      projectKeyLength: options.projectKey?.length 
    });

    if (!this.validateProjectKey(options.projectKey, "getAnalyses")) {
      return [];
    }

    try {
      const response = await this.client.get<AnalysesSearchResponse>(
        "/api/project_analyses/search",
        {
          project: options.projectKey,
          branch: options.branch,
          category: options.category,
          from: options.from,
          to: options.to,
          ps: options.pageSize ?? 10,
        }
      );
      this.logger.info(`<<< getAnalyses success`, { analysesCount: response.analyses.length });
      return response.analyses;
    } catch (error) {
      this.logger.error(`getAnalyses failed`, { error: String(error), projectKey: options.projectKey });
      return [];
    }
  }

  /**
   * Get the latest analysis for a project
   */
  async getLatestAnalysis(projectKey: string, branch?: string): Promise<ProjectAnalysis | undefined> {
    const analyses = await this.getAnalyses({ projectKey, branch, pageSize: 1 });
    return analyses[0];
  }

  /**
   * Format analysis history for agent display
   */
  formatAnalysesForAgent(analyses: ProjectAnalysis[]): string {
    if (analyses.length === 0) {
      return "No analysis history found.";
    }

    const lines = ["## Analysis History", ""];

    for (const analysis of analyses) {
      const date = new Date(analysis.date).toLocaleString();
      const version = analysis.projectVersion ? ` (v${analysis.projectVersion})` : "";
      
      lines.push(`### ${date}${version}`);
      
      if (analysis.revision) {
        lines.push(`**Revision:** \`${analysis.revision.substring(0, 8)}\``);
      }

      if (analysis.events.length > 0) {
        const eventNames = analysis.events.map(e => {
          const icon = {
            VERSION: "🏷️",
            QUALITY_GATE: "🚦",
            QUALITY_PROFILE: "📋",
            DEFINITION_CHANGE: "📝",
            OTHER: "📌",
          }[e.category] ?? "•";
          return `${icon} ${e.name}`;
        });
        lines.push(`**Events:** ${eventNames.join(", ")}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }
}
