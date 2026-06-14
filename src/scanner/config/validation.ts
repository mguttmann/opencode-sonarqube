/**
 * Config Validation and Auto-Repair
 * Detects and fixes known configuration issues in existing projects
 */

import { Logger } from "../../utils/logger.ts";
import { MONOREPO_PATTERNS } from "./patterns.ts";
import { detectSourceDirectories } from "./detection.ts";

const logger = new Logger("config-validation");

/**
 * Result of a config validation
 */
export interface ValidationResult {
  valid: boolean;
  repairs: string[];
}

/**
 * Check if a sources string contains bare monorepo containers
 * that would cause the scanner to scan build artifacts (.next, dist, etc.)
 *
 * Bad: "apps,packages" (scans everything including .next)
 * Good: "apps/api/src,packages/shared/src" (only source code)
 * Good: "src" (standard project)
 */
export function sourcesNeedRepair(sources: string): boolean {
  if (!sources) return false;
  const parts = sources.split(",").map((s) => s.trim());
  return parts.some((part) => MONOREPO_PATTERNS.includes(part));
}

/**
 * Validate and repair .sonarqube/config.json
 * Returns the repairs applied
 */
export async function validateAndRepairConfig(
  directory: string
): Promise<ValidationResult> {
  const configPath = `${directory}/.sonarqube/config.json`;
  const repairs: string[] = [];

  try {
    const file = Bun.file(configPath);
    if (!(await file.exists())) {
      return { valid: true, repairs };
    }

    const config = await file.json();
    let changed = false;

    // Check if sources need repair (bare monorepo containers)
    if (config.sources && sourcesNeedRepair(config.sources)) {
      const oldSources = config.sources;
      const newSources = detectSourceDirectories(directory);
      if (newSources !== oldSources) {
        config.sources = newSources;
        changed = true;
        repairs.push(
          `Updated sources: "${oldSources}" → "${newSources}" (avoid scanning build artifacts)`
        );
      }
    }

    // Check for empty sources (would cause full project scan)
    if (config.sources === "" || config.sources === ".") {
      const detected = detectSourceDirectories(directory);
      if (detected !== ".") {
        config.sources = detected;
        changed = true;
        repairs.push(`Detected sources: "${detected}"`);
      }
    }

    if (changed) {
      await Bun.write(configPath, JSON.stringify(config, null, 2));
      logger.info("Repaired config.json", { repairs });
    }

    return { valid: !changed, repairs };
  } catch (error) {
    logger.warn("Could not validate config.json", { error });
    return { valid: true, repairs };
  }
}

/**
 * Validate and repair sonar-project.properties
 */
export async function validateAndRepairProperties(
  directory: string
): Promise<ValidationResult> {
  const propertiesPath = `${directory}/sonar-project.properties`;
  const repairs: string[] = [];

  try {
    const file = Bun.file(propertiesPath);
    if (!(await file.exists())) {
      return { valid: true, repairs };
    }

    let content = await file.text();
    let changed = false;

    // Check for bare monorepo sources
    const sourcesRegex = /^sonar\.sources=(.+)$/m;
    const sourcesMatch = sourcesRegex.exec(content);
    if (sourcesMatch) {
      const currentSources = sourcesMatch[1];
      if (sourcesNeedRepair(currentSources)) {
        const newSources = detectSourceDirectories(directory);
        if (newSources !== currentSources) {
          // Use regex replacement to ensure we only match the property line
          content = content.replace(sourcesRegex, `sonar.sources=${newSources}`);
          changed = true;
          repairs.push(
            `Updated sonar.sources: "${currentSources}" → "${newSources}"`
          );
        }
      }
    }

    // Check for bare monorepo tests
    const testsRegex = /^sonar\.tests=(.+)$/m;
    const testsMatch = testsRegex.exec(content);
    if (testsMatch) {
      const currentTests = testsMatch[1];
      if (sourcesNeedRepair(currentTests)) {
        const newTests = detectSourceDirectories(directory);
        if (newTests !== currentTests) {
          content = content.replace(testsRegex, `sonar.tests=${newTests}`);
          changed = true;
          repairs.push(
            `Updated sonar.tests: "${currentTests}" → "${newTests}"`
          );
        }
      }
    }

    if (changed) {
      await Bun.write(propertiesPath, content);
      logger.info("Repaired sonar-project.properties", { repairs });
    }

    return { valid: !changed, repairs };
  } catch (error) {
    logger.warn("Could not validate sonar-project.properties", { error });
    return { valid: true, repairs };
  }
}

/**
 * Validate and repair all configuration files for a project
 */
export async function validateAndRepairAll(
  directory: string
): Promise<ValidationResult> {
  const configResult = await validateAndRepairConfig(directory);
  const propertiesResult = await validateAndRepairProperties(directory);

  const allRepairs = [...configResult.repairs, ...propertiesResult.repairs];
  const allValid = configResult.valid && propertiesResult.valid;

  if (allRepairs.length > 0) {
    logger.info("Config validation completed with repairs", {
      repairCount: allRepairs.length,
    });
  }

  return { valid: allValid, repairs: allRepairs };
}
