/**
 * Path manipulation utilities
 */

/**
 * Extract file path from SonarQube component key
 * Component keys are formatted as "projectKey:path/to/file.ts"
 */
export function extractFilePathFromComponentKey(componentKey: string): string {
  const colonIndex = componentKey.indexOf(":");
  if (colonIndex >= 0) {
    return componentKey.substring(colonIndex + 1);
  }
  return componentKey;
}

/**
 * Shorten a path for display, keeping the end
 */
export function shortenPath(path: string, maxLength: number = 50): string {
  if (path.length <= maxLength) return path;
  return "..." + path.slice(-(maxLength - 3));
}
