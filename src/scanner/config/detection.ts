/**
 * Project Type Detection
 * Detects languages, package managers, frameworks, and source directories
 */

import { Logger } from "../../utils/logger.ts";
import { MONOREPO_PATTERNS, SOURCE_SUBDIR_PATTERNS, SOURCE_DIRECTORY_PATTERNS } from "./patterns.ts";

const logger = new Logger("scanner-config");

/**
 * Language detection result
 */
export interface LanguageDetection {
  languages: string[];
  packageManager?: "npm" | "yarn" | "pnpm" | "bun";
  framework?: string;
  testFramework?: string;
  coverageReportPath?: string;
}

/**
 * File existence check results
 */
export interface FileChecks {
  hasPackageJson: boolean;
  hasTsConfig: boolean;
  hasRequirements: boolean;
  hasPyproject: boolean;
  hasPom: boolean;
  hasGradle: boolean;
  hasGoMod: boolean;
  hasCargo: boolean;
  hasComposer: boolean;
  hasGemfile: boolean;
  hasNpmLock: boolean;
  hasYarnLock: boolean;
  hasPnpmLock: boolean;
  hasBunLock: boolean;
}

/**
 * Check if project files exist
 */
export async function checkProjectFiles(directory: string): Promise<FileChecks> {
  const checks = await Promise.all([
    Bun.file(`${directory}/package.json`).exists(),
    Bun.file(`${directory}/tsconfig.json`).exists(),
    Bun.file(`${directory}/requirements.txt`).exists(),
    Bun.file(`${directory}/pyproject.toml`).exists(),
    Bun.file(`${directory}/pom.xml`).exists(),
    Bun.file(`${directory}/build.gradle`).exists(),
    Bun.file(`${directory}/go.mod`).exists(),
    Bun.file(`${directory}/Cargo.toml`).exists(),
    Bun.file(`${directory}/composer.json`).exists(),
    Bun.file(`${directory}/Gemfile`).exists(),
    Bun.file(`${directory}/package-lock.json`).exists(),
    Bun.file(`${directory}/yarn.lock`).exists(),
    Bun.file(`${directory}/pnpm-lock.yaml`).exists(),
    Bun.file(`${directory}/bun.lockb`).exists(),
  ]);

  return {
    hasPackageJson: checks[0],
    hasTsConfig: checks[1],
    hasRequirements: checks[2],
    hasPyproject: checks[3],
    hasPom: checks[4],
    hasGradle: checks[5],
    hasGoMod: checks[6],
    hasCargo: checks[7],
    hasComposer: checks[8],
    hasGemfile: checks[9],
    hasNpmLock: checks[10],
    hasYarnLock: checks[11],
    hasPnpmLock: checks[12],
    hasBunLock: checks[13],
  };
}

/**
 * Detect package manager from lock files
 */
export function detectPackageManager(
  checks: FileChecks
): "npm" | "yarn" | "pnpm" | "bun" | undefined {
  if (checks.hasBunLock) return "bun";
  if (checks.hasPnpmLock) return "pnpm";
  if (checks.hasYarnLock) return "yarn";
  if (checks.hasNpmLock) return "npm";
  return undefined;
}

/**
 * Detect framework from package.json dependencies
 */
export function detectFramework(deps: Record<string, string>): string | undefined {
  if (deps["next"]) return "next";
  if (deps["react"]) return "react";
  if (deps["vue"]) return "vue";
  if (deps["@angular/core"]) return "angular";
  if (deps["svelte"]) return "svelte";
  return undefined;
}

/**
 * Detect test framework and coverage path from dependencies
 */
export function detectTestFramework(deps: Record<string, string>): {
  testFramework?: string;
  coverageReportPath?: string;
} {
  if (deps["jest"] || deps["@jest/core"]) {
    return { testFramework: "jest", coverageReportPath: "coverage/lcov.info" };
  }
  if (deps["vitest"]) {
    return { testFramework: "vitest", coverageReportPath: "coverage/lcov.info" };
  }
  if (deps["c8"] || deps["nyc"]) {
    return { coverageReportPath: "coverage/lcov.info" };
  }
  return {};
}

/**
 * Parse package.json and extract relevant info
 */
export async function parsePackageJson(
  directory: string
): Promise<{ framework?: string; testFramework?: string; coverageReportPath?: string }> {
  try {
    const packageJson = await Bun.file(`${directory}/package.json`).json();
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const framework = detectFramework(deps);
    const testInfo = detectTestFramework(deps);

    return {
      framework,
      ...testInfo,
    };
  } catch {
    return {};
  }
}

/**
 * Language detector configuration
 */
interface LanguageDetector {
  name: string;
  check: (checks: FileChecks) => boolean;
  includes?: string[];
}

/**
 * Data-driven language detection configuration
 */
const LANGUAGE_DETECTORS: LanguageDetector[] = [
  {
    name: "typescript",
    check: (c) => c.hasPackageJson && c.hasTsConfig,
    includes: ["javascript"],
  },
  { name: "javascript", check: (c) => c.hasPackageJson && !c.hasTsConfig },
  { name: "python", check: (c) => c.hasRequirements || c.hasPyproject },
  { name: "java", check: (c) => c.hasPom || c.hasGradle },
  { name: "go", check: (c) => c.hasGoMod },
  { name: "rust", check: (c) => c.hasCargo },
  { name: "php", check: (c) => c.hasComposer },
  { name: "ruby", check: (c) => c.hasGemfile },
];

/**
 * Detect languages from file checks
 */
export function detectLanguages(checks: FileChecks): string[] {
  const languages: string[] = [];

  for (const detector of LANGUAGE_DETECTORS) {
    if (detector.check(checks)) {
      languages.push(detector.name);
      if (detector.includes) {
        languages.push(...detector.includes);
      }
    }
  }

  return languages.length > 0 ? languages : ["generic"];
}

/**
 * Check if a directory exists
 */
function directoryExists(path: string): boolean {
  try {
    return Bun.spawnSync(["test", "-d", path]).exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get subdirectories of a directory
 */
function getSubdirectories(path: string): string[] {
  try {
    const result = Bun.spawnSync(["ls", "-1", path]);
    if (result.exitCode !== 0) return [];
    const output = result.stdout.toString().trim();
    if (!output) return [];
    const SKIP_DIRS = new Set([
      "node_modules", "dist", "build", "out", "coverage",
      ".next", ".nuxt", ".output", "target", "__pycache__",
      ".venv", "venv", "vendor", "tmp", ".turbo", ".cache",
    ]);
    return output.split("\n").filter((name) => {
      if (name.startsWith(".")) return false;
      if (SKIP_DIRS.has(name)) return false;
      return directoryExists(`${path}/${name}`);
    });
  } catch {
    return [];
  }
}

/**
 * Find source directories within a monorepo container (apps, packages, etc.)
 */
function findSourcesInMonorepoContainer(
  directory: string,
  monoPattern: string
): string[] {
  const sources: string[] = [];
  const monoPath = `${directory}/${monoPattern}`;
  
  if (!directoryExists(monoPath)) return sources;
  
  const subdirs = getSubdirectories(monoPath);
  let foundSrcSubdirs = false;
  
  // Look for src directories inside each app/package
  for (const subdir of subdirs) {
    for (const srcPattern of SOURCE_SUBDIR_PATTERNS) {
      const srcPath = `${monoPattern}/${subdir}/${srcPattern}`;
      if (directoryExists(`${directory}/${srcPath}`)) {
        sources.push(srcPath);
        foundSrcSubdirs = true;
      }
    }
  }
  
  // Fallback: if no src subdirs found, use package dirs directly (flat structure)
  if (!foundSrcSubdirs && subdirs.length > 0) {
    for (const subdir of subdirs) {
      sources.push(`${monoPattern}/${subdir}`);
    }
  }
  
  return sources;
}

/**
 * Detect monorepo source directories (apps/x/src, packages/y/src)
 */
function detectMonorepoSources(directory: string): string[] {
  const sources: string[] = [];
  
  for (const monoPattern of MONOREPO_PATTERNS) {
    const found = findSourcesInMonorepoContainer(directory, monoPattern);
    sources.push(...found);
  }
  
  return sources;
}

/**
 * Detect standard source directories (src, lib, etc.)
 */
function detectStandardSources(directory: string): string[] {
  const sources: string[] = [];
  
  for (const pattern of SOURCE_DIRECTORY_PATTERNS) {
    if (directoryExists(`${directory}/${pattern}`)) {
      sources.push(pattern);
    }
  }
  
  return sources;
}

/**
 * Detect source directories in the project
 * For monorepos: finds apps/[app]/src, packages/[pkg]/src patterns
 * For standard projects: finds src, lib, etc.
 * Falls back to "." if no common directories found
 */
export function detectSourceDirectories(directory: string): string {
  /* c8 ignore start - filesystem dependent */
  
  // First try monorepo detection
  const monoSources = detectMonorepoSources(directory);
  if (monoSources.length > 0) {
    logger.info("Detected monorepo source directories", { directories: monoSources });
    return monoSources.join(",");
  }

  // Then try standard source directories
  const standardSources = detectStandardSources(directory);
  if (standardSources.length > 0) {
    logger.info("Detected source directories", { directories: standardSources });
    return standardSources.join(",");
  }

  /* c8 ignore stop */

  // Fallback: scan entire project
  logger.info("No common source directories found, scanning entire project");
  return ".";
}

/**
 * Detect project languages and configuration
 */
export async function detectProjectType(directory: string): Promise<LanguageDetection> {
  const checks = await checkProjectFiles(directory);
  const languages = detectLanguages(checks);

  const result: LanguageDetection = { languages };

  // Set package manager if Node.js project
  if (checks.hasPackageJson) {
    result.packageManager = detectPackageManager(checks);

    // Parse package.json for framework and test info
    const packageInfo = await parsePackageJson(directory);
    result.framework = packageInfo.framework;
    result.testFramework = packageInfo.testFramework;
    result.coverageReportPath = packageInfo.coverageReportPath;
  }

  logger.info("Detected project type", {
    languages: result.languages,
    packageManager: result.packageManager,
  });

  return result;
}
