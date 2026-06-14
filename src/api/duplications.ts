/**
 * SonarQube Duplications API
 * Finds and reports code duplications
 */

import type { SonarQubeClient } from "./client.ts";
import { Logger } from "../utils/logger.ts";
import { extractFilePathFromComponentKey } from "../utils/paths.ts";
import { BaseAPI } from "./base-api.ts";

/**
 * Duplicated block in source code
 */
export interface DuplicatedBlock {
  from: number;
  size: number;
  _ref: string;
}

/**
 * Duplication between blocks
 */
export interface Duplication {
  blocks: DuplicatedBlock[];
}

/**
 * File info in duplications response
 */
export interface DuplicationFile {
  key: string;
  name: string;
  projectName?: string;
}

/**
 * Duplications search response
 */
interface DuplicationsShowResponse {
  duplications: Duplication[];
  files: Record<string, DuplicationFile>;
}

/**
 * Formatted duplication for display
 */
export interface FormattedDuplication {
  originalFile: string;
  originalLines: { from: number; to: number };
  duplicateFile: string;
  duplicateLines: { from: number; to: number };
  lineCount: number;
}

export class DuplicationsAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-duplications", logger);
  }

  /**
   * Get duplications for a component
   */
  async getDuplications(componentKey: string): Promise<FormattedDuplication[]> {
    this.logger.debug(`Fetching duplications for: ${componentKey}`);

    try {
      const response = await this.client.get<DuplicationsShowResponse>(
        "/api/duplications/show",
        { key: componentKey }
      );

      return this.formatDuplications(response, componentKey);
    } catch (error) {
      this.logger.warn(`Failed to fetch duplications: ${error}`);
      return [];
    }
  }

  /**
   * Get all duplications for a project
   */
  async getProjectDuplications(
    projectKey: string,
    limit: number = 20
  ): Promise<FormattedDuplication[]> {
    this.logger.debug(`Fetching project duplications: ${projectKey}`);

    try {
      // First get components with duplications
      const components = await this.client.get<{
        components: Array<{ key: string; measures: Array<{ metric: string; value: string }> }>;
      }>("/api/measures/component_tree", {
        component: projectKey,
        metricKeys: "duplicated_lines_density",
        ps: 100,
        s: "metric,name",
        asc: "false",
      });

      // Filter components with duplications
      const duplicatedComponents = components.components
        .filter(c => {
          const measure = c.measures.find(m => m.metric === "duplicated_lines_density");
          return measure ? Number.parseFloat(measure.value) > 0 : false;
        })
        .slice(0, limit);

      // Get duplications for each component
      const allDuplications: FormattedDuplication[] = [];
      for (const component of duplicatedComponents) {
        const dups = await this.getDuplications(component.key);
        allDuplications.push(...dups);
      }

      return allDuplications;
    } catch (error) {
      this.logger.warn(`Failed to fetch project duplications: ${error}`);
      return [];
    }
  }

  /**
   * Format duplications for display
   */
  private formatDuplications(
    response: DuplicationsShowResponse,
    originalKey: string
  ): FormattedDuplication[] {
    const result: FormattedDuplication[] = [];

    for (const duplication of response.duplications) {
      if (duplication.blocks.length < 2) continue;

      // Find the original block and duplicates
      const originalBlock = duplication.blocks.find(
        b => response.files[b._ref]?.key === originalKey
      );
      const duplicateBlocks = duplication.blocks.filter(
        b => response.files[b._ref]?.key !== originalKey || b !== originalBlock
      );

      if (!originalBlock) continue;

      for (const dupBlock of duplicateBlocks) {
        const originalFile = response.files[originalBlock._ref];
        const duplicateFile = response.files[dupBlock._ref];

        if (!originalFile || !duplicateFile) continue;

        result.push({
          originalFile: extractFilePathFromComponentKey(originalFile.key),
          originalLines: {
            from: originalBlock.from,
            to: originalBlock.from + originalBlock.size - 1,
          },
          duplicateFile: extractFilePathFromComponentKey(duplicateFile.key),
          duplicateLines: {
            from: dupBlock.from,
            to: dupBlock.from + dupBlock.size - 1,
          },
          lineCount: originalBlock.size,
        });
      }
    }

    return result;
  }

  /**
   * Format duplications for agent display
   */
  formatForAgent(duplications: FormattedDuplication[]): string {
    if (duplications.length === 0) {
      return "No code duplications found.";
    }

    const lines: string[] = [
      `## Code Duplications Found: ${duplications.length}`,
      "",
    ];

    // Group by original file
    const byFile = new Map<string, FormattedDuplication[]>();
    for (const dup of duplications) {
      const existing = byFile.get(dup.originalFile) ?? [];
      existing.push(dup);
      byFile.set(dup.originalFile, existing);
    }

    for (const [file, dups] of byFile) {
      lines.push(`### \`${file}\``);
      for (const dup of dups) {
        const isSameFile = dup.originalFile === dup.duplicateFile;
        if (isSameFile) {
          lines.push(
            `- Lines ${dup.originalLines.from}-${dup.originalLines.to} duplicated at lines ${dup.duplicateLines.from}-${dup.duplicateLines.to} (${dup.lineCount} lines)`
          );
        } else {
          lines.push(
            `- Lines ${dup.originalLines.from}-${dup.originalLines.to} duplicated in \`${dup.duplicateFile}\` lines ${dup.duplicateLines.from}-${dup.duplicateLines.to} (${dup.lineCount} lines)`
          );
        }
      }
      lines.push("");
    }

    lines.push("**Recommendation:** Extract duplicated code into shared functions or modules.");

    return lines.join("\n");
  }
}
