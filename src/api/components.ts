/**
 * SonarQube Components API
 * Uses /api/measures/component_tree to get component (file/directory) information with issue counts
 * @see https://docs.sonarsource.com/sonarqube-community-build/extension-guide/web-api/
 */

import type { SonarQubeClient } from "./client.ts";
import { Logger } from "../utils/logger.ts";
import { shortenPath } from "../utils/paths.ts";
import { BaseAPI } from "./base-api.ts";

/**
 * Component from SonarQube
 */
export interface Component {
  key: string;
  name: string;
  qualifier: "TRK" | "DIR" | "FIL" | "UTS";
  path?: string;
  language?: string;
}

/**
 * Component with measures (issue counts)
 */
export interface ComponentWithMeasures extends Component {
  measures?: Array<{
    metric: string;
    value: string;
  }>;
}

/**
 * Components tree response
 */
interface ComponentsTreeResponse {
  paging: {
    pageIndex: number;
    pageSize: number;
    total: number;
  };
  baseComponent: Component;
  components: ComponentWithMeasures[];
}

/**
 * File with issue summary
 */
export interface FileIssueSummary {
  path: string;
  language?: string;
  bugs: number;
  vulnerabilities: number;
  codeSmells: number;
  securityHotspots: number;
  total: number;
}

export class ComponentsAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-components", logger);
  }

  /**
   * Convert component with measures to FileIssueSummary
   */
  private componentToSummary(comp: ComponentWithMeasures, includeLanguage: boolean): FileIssueSummary {
    const measures = new Map(
      comp.measures?.map((m) => [m.metric, Number.parseInt(m.value, 10)]) ?? []
    );

    const bugs = measures.get("bugs") ?? 0;
    const vulnerabilities = measures.get("vulnerabilities") ?? 0;
    const codeSmells = measures.get("code_smells") ?? 0;
    const securityHotspots = measures.get("security_hotspots") ?? 0;

    return {
      path: comp.path ?? comp.name,
      language: includeLanguage ? comp.language : undefined,
      bugs,
      vulnerabilities,
      codeSmells,
      securityHotspots,
      total: bugs + vulnerabilities + codeSmells + securityHotspots,
    };
  }

  /**
   * Get component tree with measures
   */
  async getTree(options: {
    componentKey: string;
    qualifiers?: ("DIR" | "FIL")[];
    metricKeys?: string[];
    strategy?: "all" | "children" | "leaves";
    pageSize?: number;
    page?: number;
    sort?: string;
  }): Promise<ComponentsTreeResponse> {
    this.logger.debug(`Getting component tree for ${options.componentKey}`);

    const metrics = options.metricKeys ?? [
      "bugs",
      "vulnerabilities",
      "code_smells",
      "security_hotspots",
    ];

    return this.client.get<ComponentsTreeResponse>("/api/measures/component_tree", {
      component: options.componentKey,
      qualifiers: options.qualifiers?.join(",") ?? "FIL",
      metricKeys: metrics.join(","),
      strategy: options.strategy ?? "leaves",
      s: options.sort ?? "metric,name",
      metricSort: "bugs",
      metricSortFilter: "withMeasuresOnly",
      asc: "false",
      ps: options.pageSize ?? 100,
      p: options.page ?? 1,
    });
  }

  /**
   * Get files with the most issues
   */
  async getWorstFiles(
    projectKey: string,
    limit: number = 20
  ): Promise<FileIssueSummary[]> {
    this.logger.debug(`Getting worst files for ${projectKey}`);

    try {
      const response = await this.getTree({
        componentKey: projectKey,
        qualifiers: ["FIL"],
        pageSize: limit,
      });

      return response.components
        .map((comp) => this.componentToSummary(comp, true))
        .filter((f) => f.total > 0);
    } catch (error) {
      this.logger.warn(`Failed to get worst files: ${error}`);
      return [];
    }
  }

  /**
   * Get directories with the most issues
   */
  async getWorstDirectories(
    projectKey: string,
    limit: number = 10
  ): Promise<FileIssueSummary[]> {
    this.logger.debug(`Getting worst directories for ${projectKey}`);

    try {
      const response = await this.getTree({
        componentKey: projectKey,
        qualifiers: ["DIR"],
        strategy: "children",
        pageSize: limit,
      });

      return response.components
        .map((comp) => this.componentToSummary(comp, false))
        .filter((d) => d.total > 0);
    } catch (error) {
      this.logger.warn(`Failed to get worst directories: ${error}`);
      return [];
    }
  }

  /**
   * Format worst files for agent display
   */
  formatWorstFilesForAgent(files: FileIssueSummary[]): string {
    if (files.length === 0) {
      return "No files with issues found. Your code is clean!";
    }

    const lines = [
      "## Files with Most Issues",
      "",
      "| File | Bugs | Vulns | Smells | Total |",
      "|------|------|-------|--------|-------|",
    ];

    for (const file of files.slice(0, 20)) {
      lines.push(
        `| ${shortenPath(file.path)} | ${file.bugs} | ${file.vulnerabilities} | ${file.codeSmells} | **${file.total}** |`
      );
    }

    if (files.length > 20) {
      lines.push(`\n*... and ${files.length - 20} more files with issues*`);
    }

    lines.push("", "### Recommendations", "");

    const withBugs = files.filter((f) => f.bugs > 0);
    const withVulns = files.filter((f) => f.vulnerabilities > 0);

    if (withBugs.length > 0) {
      lines.push(`- **Priority 1:** Fix bugs in \`${withBugs[0].path}\` (${withBugs[0].bugs} bugs)`);
    }
    if (withVulns.length > 0) {
      lines.push(`- **Priority 2:** Fix vulnerabilities in \`${withVulns[0].path}\` (${withVulns[0].vulnerabilities} vulnerabilities)`);
    }

    return lines.join("\n");
  }
}
