/**
 * Base API class for all SonarQube API modules
 * Provides common constructor pattern with client and logger
 */

import type { SonarQubeClient } from "./client.ts";
import { Logger } from "../utils/logger.ts";

export abstract class BaseAPI {
  protected readonly client: SonarQubeClient;
  protected readonly logger: Logger;

  constructor(client: SonarQubeClient, serviceName: string, logger?: Logger) {
    this.client = client;
    this.logger = logger ?? new Logger(serviceName);
  }

  /**
   * Validate that projectKey is not empty
   * @returns true if valid, false otherwise
   */
  protected validateProjectKey(projectKey: string, methodName: string): boolean {
    if (!projectKey) {
      this.logger.error(`${methodName}: projectKey is empty/undefined!`);
      return false;
    }
    return true;
  }

  /**
   * Execute a request with automatic error handling and logging
   */
  protected async safeRequest<T>(
    request: () => Promise<T>,
    fallback: T,
    context: string
  ): Promise<T> {
    try {
      return await request();
    } catch (error) {
      this.logger.warn(`${context}: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  }
}
