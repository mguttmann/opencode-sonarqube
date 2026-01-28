/**
 * Pattern helpers for SonarQube Scanner Configuration
 * Exclusion patterns, test patterns, and source directory patterns
 */

/**
 * Language detection result (minimal type for pattern functions)
 */
interface LanguageDetectionForPatterns {
  languages: string[];
}

/**
 * Monorepo container directories (contain multiple apps/packages)
 * These need special handling to find src subdirectories
 */
export const MONOREPO_PATTERNS = [
  "apps",
  "packages",
  "modules",
  "services",
  "libs",
];

/**
 * Standard source directory names to look for inside monorepo subdirs
 */
export const SOURCE_SUBDIR_PATTERNS = ["src", "source", "lib"];

/**
 * Common source directory patterns for different project types
 */
export const SOURCE_DIRECTORY_PATTERNS = [
  // Standard source directories
  "src",
  "source",
  "lib",
  "app",
  // Language-specific
  "cmd", // Go
  "pkg", // Go
  "internal", // Go
  "main", // Java (src/main)
  "core", // Various
];

/**
 * Get default exclusion patterns
 */
export function getDefaultExclusions(_detection: LanguageDetectionForPatterns): string {
  const patterns = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/*.d.ts",
    "**/*.min.js",
    "**/*.min.css",
    "**/vendor/**",
    "**/__pycache__/**",
    "**/.venv/**",
    "**/venv/**",
    "**/target/**",
  ];

  return patterns.join(",");
}

/**
 * Get test file patterns
 */
export function getTestPatterns(languages: string[]): string {
  const patterns: string[] = [];

  if (languages.includes("typescript") || languages.includes("javascript")) {
    patterns.push(
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.test.js",
      "**/*.test.jsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/*.spec.js",
      "**/*.spec.jsx",
      "**/__tests__/**",
      "**/__mocks__/**"
    );
  }

  if (languages.includes("python")) {
    patterns.push("**/test_*.py", "**/*_test.py", "**/tests/**");
  }

  if (languages.includes("java")) {
    patterns.push("**/*Test.java", "**/*Tests.java", "**/test/**");
  }

  if (languages.includes("go")) {
    patterns.push("**/*_test.go");
  }

  return patterns.join(",");
}
