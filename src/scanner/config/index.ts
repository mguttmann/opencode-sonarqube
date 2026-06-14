/**
 * SonarQube Scanner Configuration
 * Re-exports public functions from submodules
 */

// Detection exports
export { detectProjectType } from "./detection.ts";
export type { LanguageDetection, FileChecks } from "./detection.ts";

// Properties exports
export { generatePropertiesContent, writePropertiesFile } from "./properties.ts";

// Pattern exports (for advanced usage)
export {
  SOURCE_DIRECTORY_PATTERNS,
  getDefaultExclusions,
  getTestPatterns,
} from "./patterns.ts";
