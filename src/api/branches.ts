/**
 * SonarQube Project Branches API
 * Provides access to branch information
 */

import type { SonarQubeClient } from "./client.ts";
import { Logger } from "../utils/logger.ts";
import { BaseAPI } from "./base-api.ts";
import type { Branch, BranchStatus } from "./types.ts";

// Re-export types for backwards compatibility
export type { Branch, BranchStatus } from "./types.ts";

/**
 * Branches list response
 */
interface BranchesListResponse {
  branches: Branch[];
}

export class BranchesAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-branches", logger);
  }

  /**
   * Get all branches for a project
   */
  async getBranches(projectKey: string): Promise<Branch[]> {
    this.logger.info(`>>> getBranches called`, { projectKey, projectKeyLength: projectKey?.length });

    if (!this.validateProjectKey(projectKey, "getBranches")) {
      return [];
    }

    return this.safeRequest(
      async () => {
        const response = await this.client.get<BranchesListResponse>(
          "/api/project_branches/list",
          { project: projectKey }
        );
        this.logger.info(`<<< getBranches success`, { branchCount: response.branches.length });
        return response.branches;
      },
      [],
      `getBranches failed for ${projectKey}`
    );
  }

  /**
   * Get the main branch for a project
   */
  async getMainBranch(projectKey: string): Promise<Branch | undefined> {
    const branches = await this.getBranches(projectKey);
    return branches.find(b => b.isMain);
  }

  /**
   * Get branch by name
   */
  async getBranch(projectKey: string, branchName: string): Promise<Branch | undefined> {
    const branches = await this.getBranches(projectKey);
    return branches.find(b => b.name === branchName);
  }

  /**
   * Delete a branch
   */
  async deleteBranch(projectKey: string, branchName: string): Promise<boolean> {
    this.logger.debug(`Deleting branch ${branchName} from ${projectKey}`);

    return this.safeRequest(
      async () => {
        await this.client.post("/api/project_branches/delete", {
          project: projectKey,
          branch: branchName,
        });
        return true;
      },
      false,
      `Failed to delete branch ${branchName}`
    );
  }

  /**
   * Rename the main branch of a project.
   * Note: SonarQube only allows renaming the main branch, not other branches.
   * @param projectKey - The project key
   * @param newName - The new name for the main branch
   */
  async renameMainBranch(projectKey: string, newName: string): Promise<boolean> {
    this.logger.debug(`Renaming main branch to ${newName} in ${projectKey}`);

    try {
      await this.client.post("/api/project_branches/rename", {
        project: projectKey,
        name: newName,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to rename main branch: ${error}`);
      return false;
    }
  }

  /**
   * Format branches for agent display
   */
  formatBranchesForAgent(branches: Branch[]): string {
    if (branches.length === 0) {
      return "No branches found. This project may not have branch analysis enabled.";
    }

    const lines = ["## Project Branches", ""];
    const sorted = this.sortBranches(branches);

    for (const branch of sorted) {
      this.formatBranchEntry(branch, lines);
    }

    return lines.join("\n");
  }

  /**
   * Sort branches: main first, then by analysis date
   */
  private sortBranches(branches: Branch[]): Branch[] {
    return [...branches].sort((a, b) => {
      if (a.isMain) return -1;
      if (b.isMain) return 1;
      if (a.analysisDate && b.analysisDate) {
        return new Date(b.analysisDate).getTime() - new Date(a.analysisDate).getTime();
      }
      return 0;
    });
  }

  /**
   * Get status icon for quality gate status
   */
  private getStatusIcon(status?: BranchStatus): string {
    if (!status) return "❓";
    const icons: Record<string, string> = {
      OK: "✅",
      WARN: "⚠️",
      ERROR: "❌",
      NONE: "❓",
    };
    return icons[status.qualityGateStatus] ?? "❓";
  }

  /**
   * Format branch entry for display
   */
  private formatBranchEntry(branch: Branch, lines: string[]): void {
    const mainBadge = branch.isMain ? " ⭐ Main" : "";
    const statusIcon = this.getStatusIcon(branch.status);

    lines.push(`### ${branch.name}${mainBadge}`);

    if (branch.status) {
      lines.push(`**Quality Gate:** ${statusIcon} ${branch.status.qualityGateStatus}`);
      this.formatBranchIssues(branch.status, lines);
    }

    if (branch.analysisDate) {
      const date = new Date(branch.analysisDate).toLocaleString();
      lines.push(`**Last Analysis:** ${date}`);
    }

    lines.push("");
  }

  /**
   * Format branch issues for display
   */
  private formatBranchIssues(status: BranchStatus, lines: string[]): void {
    const hasIssues = status.bugs !== undefined || 
                      status.vulnerabilities !== undefined || 
                      status.codeSmells !== undefined;
    if (!hasIssues) return;

    const issues: string[] = [];
    if (status.bugs) issues.push(`${status.bugs} bugs`);
    if (status.vulnerabilities) issues.push(`${status.vulnerabilities} vulnerabilities`);
    if (status.codeSmells) issues.push(`${status.codeSmells} code smells`);

    if (issues.length > 0) {
      lines.push(`**Issues:** ${issues.join(", ")}`);
    }
  }
}
