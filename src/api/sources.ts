/**
 * SonarQube Sources API
 * Provides source code context for issues
 */

import type { SonarQubeClient } from "./client.ts";
import { Logger } from "../utils/logger.ts";
import { extractFilePathFromComponentKey } from "../utils/paths.ts";
import { BaseAPI } from "./base-api.ts";
import { groupBy } from "../utils/group-by.ts";

/**
 * Source line with code
 */
export interface SourceLine {
  line: number;
  code: string;
  isNew?: boolean;
  scmAuthor?: string;
  scmDate?: string;
}

/**
 * Source code snippet around an issue
 */
export interface SourceSnippet {
  component: string;
  lines: SourceLine[];
  startLine: number;
  endLine: number;
}

/**
 * Issue with source context
 */
export interface IssueWithContext {
  key: string;
  rule: string;
  severity: string;
  message: string;
  component: string;
  line?: number;
  sourceContext?: SourceSnippet;
}

/**
 * Sources search response
 */
interface SourcesShowResponse {
  sources: Array<[number, string]>;
}

/**
 * Input issue data for creating IssueWithContext
 */
interface IssueInput {
  key: string;
  rule: string;
  severity: string;
  message: string;
  component: string;
  line?: number;
}

/**
 * Create IssueWithContext from issue data
 */
function createIssueWithContext(
  issue: IssueInput,
  sourceContext?: SourceSnippet
): IssueWithContext {
  return {
    key: issue.key,
    rule: issue.rule,
    severity: issue.severity,
    message: issue.message,
    component: issue.component,
    line: issue.line,
    sourceContext,
  };
}

export class SourcesAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-sources", logger);
  }

  /**
   * Get source code lines for a component
   */
  async getSourceLines(
    componentKey: string,
    from?: number,
    to?: number
  ): Promise<SourceLine[]> {
    this.logger.debug(`Fetching source lines: ${componentKey} [${from ?? 1}-${to ?? "end"}]`);

    try {
      const response = await this.client.get<SourcesShowResponse>(
        "/api/sources/show",
        {
          key: componentKey,
          from: from ?? 1,
          to,
        }
      );

      return response.sources.map(([line, code]) => ({
        line,
        code: this.stripHtmlTags(code),
      }));
    } catch (error) {
      this.logger.warn(`Failed to fetch source lines: ${error}`);
      return [];
    }
  }

  /**
   * Get source code context around a specific line
   */
  async getContextAroundLine(
    componentKey: string,
    line: number,
    contextLines: number = 5
  ): Promise<SourceSnippet> {
    const startLine = Math.max(1, line - contextLines);
    const endLine = line + contextLines;

    const lines = await this.getSourceLines(componentKey, startLine, endLine);

    return {
      component: componentKey,
      lines,
      startLine,
      endLine,
    };
  }

  /**
   * Group issues by their component key using generic groupBy utility
   */
  private groupIssuesByComponent<T extends { component: string }>(
    issues: T[]
  ): Map<string, T[]> {
    const grouped = groupBy(issues, issue => issue.component);
    return new Map(Object.entries(grouped));
  }

  /**
   * Build source context snippet from line map
   */
  private buildSourceContext(
    component: string,
    issueLine: number,
    lineMap: Map<number, SourceLine>,
    contextLines: number
  ): SourceSnippet {
    const contextStart = Math.max(1, issueLine - contextLines);
    const contextEnd = issueLine + contextLines;
    const contextSourceLines: SourceLine[] = [];

    for (let l = contextStart; l <= contextEnd; l++) {
      const sourceLine = lineMap.get(l);
      if (sourceLine) {
        contextSourceLines.push(sourceLine);
      }
    }

    return {
      component,
      lines: contextSourceLines,
      startLine: contextStart,
      endLine: contextEnd,
    };
  }

  /**
   * Create issue with context from source lines
   */
  private createIssueWithSourceContext(
    issue: IssueInput,
    lineMap: Map<number, SourceLine>,
    contextLines: number
  ): IssueWithContext {
    if (issue.line === undefined) {
      return createIssueWithContext(issue);
    }

    const sourceContext = this.buildSourceContext(
      issue.component,
      issue.line,
      lineMap,
      contextLines
    );

    return createIssueWithContext(issue, sourceContext);
  }

  /**
   * Add issues without source context
   */
  private addIssuesWithoutContext(issues: IssueInput[]): IssueWithContext[] {
    return issues.map(issue => createIssueWithContext(issue));
  }

  /**
   * Get source context for multiple issues
   */
  async getIssuesWithContext(
    issues: Array<{
      key: string;
      rule: string;
      severity: string;
      message: string;
      component: string;
      line?: number;
    }>,
    contextLines: number = 3
  ): Promise<IssueWithContext[]> {
    const results: IssueWithContext[] = [];
    const issuesByComponent = this.groupIssuesByComponent(issues);

    for (const [component, componentIssues] of issuesByComponent) {
      const linesNeeded = componentIssues
        .filter(i => i.line !== undefined)
        .map(i => i.line!);
      
      if (linesNeeded.length === 0) {
        results.push(...this.addIssuesWithoutContext(componentIssues));
        continue;
      }

      const minLine = Math.max(1, Math.min(...linesNeeded) - contextLines);
      const maxLine = Math.max(...linesNeeded) + contextLines;

      try {
        const sourceLines = await this.getSourceLines(component, minLine, maxLine);
        const lineMap = new Map(sourceLines.map(l => [l.line, l]));

        for (const issue of componentIssues) {
          results.push(this.createIssueWithSourceContext(issue, lineMap, contextLines));
        }
      } catch {
        results.push(...this.addIssuesWithoutContext(componentIssues));
      }
    }

    return results;
  }

  /**
   * Format file location string
   */
  private formatFileLocation(filePath: string, line?: number): string {
    const lineStr = line === undefined ? "" : `:${line}`;
    return `**File:** \`${filePath}\`${lineStr}`;
  }

  /**
   * Format source code block for display
   */
  private formatSourceBlock(sourceContext: SourceSnippet, issueLine?: number): string[] {
    const codeLines = sourceContext.lines.map(sourceLine => {
      const marker = sourceLine.line === issueLine ? ">" : " ";
      const lineNum = String(sourceLine.line).padStart(4, " ");
      return `${marker}${lineNum} | ${sourceLine.code}`;
    });
    return ["", "```", ...codeLines, "```"];
  }

  /**
   * Format issue with source context for agent
   */
  formatIssueWithContext(issue: IssueWithContext): string {
    const filePath = extractFilePathFromComponentKey(issue.component);

    const lines: string[] = [
      `### ${issue.severity}: ${issue.message}`,
      this.formatFileLocation(filePath, issue.line),
      `**Rule:** \`${issue.rule}\``,
    ];

    const hasSourceContext = (issue.sourceContext?.lines.length ?? 0) > 0;
    if (hasSourceContext) {
      lines.push(...this.formatSourceBlock(issue.sourceContext!, issue.line));
    }

    return lines.join("\n");
  }

  /**
   * Strip HTML tags from source code
   * Uses a simple iterative approach to avoid regex backtracking issues (S5852)
   */
  private stripHtmlTags(html: string): string {
    let result = "";
    let inTag = false;

    for (const char of html) {
      if (char === "<") {
        inTag = true;
      } else if (char === ">") {
        inTag = false;
      } else if (!inTag) {
        result += char;
      }
    }

    return result;
  }
}
