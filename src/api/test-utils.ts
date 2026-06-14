/**
 * Shared test utilities for API tests
 * Provides test configurations that disable retries for fast, deterministic tests
 */

import { SonarQubeClient, type ClientConfig } from "./client.ts";

/** Test client configuration - disables retries for fast tests */
export const TEST_CLIENT_CONFIG = {
  maxRetries: 0,
  retryDelay: 0,
  timeout: 1000,
} as const;

/**
 * Create a SonarQube client configured for testing (no retries)
 */
export function createTestClient(
  url: string = "https://sonar.example.com",
  token: string = "test-token"
): SonarQubeClient {
  return new SonarQubeClient({
    url,
    auth: { token },
    ...TEST_CLIENT_CONFIG,
  });
}

/**
 * Create a full ClientConfig for testing
 */
export function createTestClientConfig(
  url: string = "https://sonar.example.com",
  token: string = "test-token"
): ClientConfig {
  return {
    url,
    auth: { token },
    ...TEST_CLIENT_CONFIG,
  };
}
