/**
 * Application-wide constants
 */

export const API = {
  DEFAULT_PAGE_SIZE: 500,
  DEFAULT_LIMIT: 20,
  MAX_PAGES: 10,
  POLL_INTERVAL_MS: 2000,
  ANALYSIS_TIMEOUT_MS: 300000,
  SOURCE_CONTEXT_LINES: 5,
} as const;

export const RATINGS = ["A", "B", "C", "D", "E"] as const;
export type Rating = (typeof RATINGS)[number];

export function numericToRating(value: number): Rating {
  const index = Math.min(Math.max(Math.round(value) - 1, 0), 4);
  return RATINGS[index];
}
