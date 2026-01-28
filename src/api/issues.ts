/**
 * SonarQube Issues API
 * Handles issue search, filtering, and formatting
 */

import type { SonarQubeClient } from "./client.ts";
import type {
  IssuesSearchResponse,
  SonarQubeIssue,
  FormattedIssue,
  IssueSeverity,
  IssueType,
  SecurityHotspot,
  HotspotsSearchResponse,
} from "../types/index.ts";
import { Logger } from "../utils/logger.ts";
import { extractFilePathFromComponentKey } from "../utils/paths.ts";
import { BaseAPI } from "./base-api.ts";
import { API } from "../constants.ts";

export class IssuesAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-issues", logger);
  }

  /**
   * Search for issues
   */
  async search(options: {
    projectKey: string;
    severities?: IssueSeverity[];
    types?: IssueType[];
    statuses?: string[];
    resolved?: boolean;
    onBranch?: string;
    inNewCode?: boolean;
    pageSize?: number;
    page?: number;
  }): Promise<IssuesSearchResponse> {
    this.logger.debug(`Searching issues for project: ${options.projectKey}`);

    return this.client.get<IssuesSearchResponse>("/api/issues/search", {
      componentKeys: options.projectKey,
      severities: options.severities?.join(","),
      types: options.types?.join(","),
      statuses: options.statuses?.join(","),
      resolved: options.resolved === undefined ? undefined : String(options.resolved),
      branch: options.onBranch,
      inNewCodePeriod: options.inNewCode === undefined ? undefined : String(options.inNewCode),
      ps: options.pageSize ?? API.DEFAULT_PAGE_SIZE,
      p: options.page ?? 1,
    });
  }

  /**
   * Get all issues for a project (handles pagination)
   */
  async getAll(options: {
    projectKey: string;
    severities?: IssueSeverity[];
    types?: IssueType[];
    maxPages?: number;
  }): Promise<SonarQubeIssue[]> {
    const allIssues: SonarQubeIssue[] = [];
    const maxPages = options.maxPages ?? 10;
    let page = 1;

    while (page <= maxPages) {
      const response = await this.search({
        projectKey: options.projectKey,
        severities: options.severities,
        types: options.types,
        resolved: false,
        page,
        pageSize: API.DEFAULT_PAGE_SIZE,
      });

      allIssues.push(...response.issues);

      // Check if we have more pages
      const totalPages = Math.ceil(response.paging.total / response.paging.pageSize);
      if (page >= totalPages) break;

      page++;
    }

    this.logger.info(`Found ${allIssues.length} issues for project ${options.projectKey}`);
    return allIssues;
  }

  /**
   * Get issues by severity levels
   */
  async getBySeverity(
    projectKey: string,
    severities: IssueSeverity[]
  ): Promise<SonarQubeIssue[]> {
    return this.getAll({ projectKey, severities });
  }

  /**
   * Get only blocker and critical issues
   */
  async getCritical(projectKey: string): Promise<SonarQubeIssue[]> {
    return this.getBySeverity(projectKey, ["BLOCKER", "CRITICAL"]);
  }

  /**
   * Get security issues (vulnerabilities only - security hotspots have a separate API)
   */
  async getSecurityIssues(projectKey: string): Promise<SonarQubeIssue[]> {
    return this.getAll({
      projectKey,
      types: ["VULNERABILITY"],
    });
  }

  /**
   * Get bugs only
   */
  async getBugs(projectKey: string): Promise<SonarQubeIssue[]> {
    return this.getAll({
      projectKey,
      types: ["BUG"],
    });
  }

  /**
   * Format raw issues for agent consumption
   */
  formatIssues(
    issues: SonarQubeIssue[],
    components: IssuesSearchResponse["components"]
  ): FormattedIssue[] {
    // Create a map of component keys to paths
    const componentPaths = new Map<string, string>();
    for (const comp of components) {
      componentPaths.set(comp.key, comp.path ?? comp.longName ?? comp.name);
    }

    return issues.map((issue) => {
      // Extract relative file path from component
      const componentPath = componentPaths.get(issue.component);
      const filePath = extractFilePathFromComponentKey(componentPath ?? issue.component);

      return {
        key: issue.key,
        severity: issue.severity,
        type: issue.type,
        rule: issue.rule,
        message: issue.message,
        file: filePath,
        line: issue.line ?? issue.textRange?.startLine,
        effort: issue.effort,
        quickFixAvailable: issue.quickFixAvailable ?? false,
      };
    });
  }

  /**
   * Get formatted issues ready for agent consumption
   */
  async getFormattedIssues(options: {
    projectKey: string;
    severities?: IssueSeverity[];
    types?: IssueType[];
  }): Promise<FormattedIssue[]> {
    const response = await this.search({
      projectKey: options.projectKey,
      severities: options.severities,
      types: options.types,
      resolved: false,
      pageSize: 500,
    });

    return this.formatIssues(response.issues, response.components);
  }

  /**
   * Get issue counts by severity
   */
  async getCounts(projectKey: string): Promise<{
    total: number;
    blocker: number;
    critical: number;
    major: number;
    minor: number;
    info: number;
  }> {
    const issues = await this.getAll({ projectKey, maxPages: 20 });

    const counts = {
      total: issues.length,
      blocker: 0,
      critical: 0,
      major: 0,
      minor: 0,
      info: 0,
    };

    for (const issue of issues) {
      switch (issue.severity) {
        case "BLOCKER":
          counts.blocker++;
          break;
        case "CRITICAL":
          counts.critical++;
          break;
        case "MAJOR":
          counts.major++;
          break;
        case "MINOR":
          counts.minor++;
          break;
        case "INFO":
          counts.info++;
          break;
      }
    }

    return counts;
  }

  /**
   * Get security hotspots for a project
   * Security hotspots are potential security issues that need manual review
   */
  async getSecurityHotspots(projectKey: string): Promise<SecurityHotspot[]> {
    this.logger.debug(`Getting security hotspots for project: ${projectKey}`);

    try {
      const response = await this.client.get<HotspotsSearchResponse>(
        "/api/hotspots/search",
        {
          projectKey,
          ps: API.DEFAULT_PAGE_SIZE,
          p: 1,
        }
      );

      this.logger.info(
        `Found ${response.hotspots.length} security hotspots for project ${projectKey}`
      );
      return response.hotspots;
    } catch (error) {
      // Hotspots API may not be available in older SonarQube versions
      this.logger.warn(`Failed to get security hotspots: ${error}`);
      return [];
    }
  }

  /**
   * Get security hotspots filtered by status
   */
  async getSecurityHotspotsToReview(projectKey: string): Promise<SecurityHotspot[]> {
    const hotspots = await this.getSecurityHotspots(projectKey);
    return hotspots.filter((h) => h.status === "TO_REVIEW");
  }

  /**
   * Review a security hotspot — mark it as SAFE, FIXED, or ACKNOWLEDGED
   * 
   * @param hotspotKey - The hotspot key (UUID)
   * @param status - Target status: "REVIEWED" to resolve, "TO_REVIEW" to reopen
   * @param resolution - Resolution when status is REVIEWED: "SAFE", "FIXED", or "ACKNOWLEDGED"
   * @param comment - Optional comment explaining the review decision
   */
  async reviewHotspot(
    hotspotKey: string,
    status: "REVIEWED" | "TO_REVIEW",
    resolution?: "SAFE" | "FIXED" | "ACKNOWLEDGED",
    comment?: string
  ): Promise<void> {
    this.logger.info(`Reviewing hotspot ${hotspotKey}: status=${status}, resolution=${resolution}`);

    const body: Record<string, string> = {
      hotspot: hotspotKey,
      status,
    };
    if (resolution && status === "REVIEWED") {
      body.resolution = resolution;
    }
    if (comment) {
      body.comment = comment;
    }

    await this.client.post<void>("/api/hotspots/change_status", body);
    this.logger.info(`Hotspot ${hotspotKey} reviewed successfully`);
  }

  /**
   * Bulk review multiple hotspots with the same resolution
   */
  async bulkReviewHotspots(
    hotspotKeys: string[],
    resolution: "SAFE" | "FIXED" | "ACKNOWLEDGED",
    comment?: string
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const key of hotspotKeys) {
      try {
        await this.reviewHotspot(key, "REVIEWED", resolution, comment);
        success++;
      } catch (error) {
        failed++;
        errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { success, failed, errors };
  }
}
