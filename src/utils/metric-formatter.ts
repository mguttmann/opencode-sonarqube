/**
 * Metric value formatting utilities
 */

import { numericToRating } from "../constants.ts";

export const MetricFormatter = {
  /**
   * Format a rating value (1-5) as letter (A-E)
   */
  rating(value: number | string): string {
    const num = typeof value === "string" ? Number.parseFloat(value) : value;
    return numericToRating(num);
  },

  /**
   * Format a percentage value
   */
  percentage(value: string | number, decimals: number = 1): string {
    const num = typeof value === "string" ? Number.parseFloat(value) : value;
    return `${num.toFixed(decimals)}%`;
  },

  /**
   * Format duration in minutes to human readable
   */
  duration(minutes: number): string {
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  },

  /**
   * Format metric by its key type
   */
  formatByType(metricKey: string, value: string): string {
    if (metricKey.includes("rating")) {
      return this.rating(value);
    }
    if (metricKey.includes("coverage") || metricKey.includes("duplicat")) {
      return this.percentage(value);
    }
    return value;
  },
};
