/**
 * SonarQube API Client
 * Handles all communication with the SonarQube server
 */

import {
  type ServerStatus,
  type AuthValidation,
  SonarQubeError,
  ConnectionError,
  AuthenticationError,
  RateLimitError,
} from "../types/index.ts";
import { Logger } from "../utils/logger.ts";

/** Authentication options - either token or user/password */
export type AuthConfig =
  | { token: string }
  | { user: string; password: string };

/** Client configuration */
export interface ClientConfig {
  url: string;
  auth: AuthConfig;
}

/** Common record type for request parameters/body */
type ParamRecord = Record<string, string | number | boolean | undefined>;

/** Request options for API calls */
interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  params?: ParamRecord;
  body?: ParamRecord;
}

/**
 * Build URL with query parameters
 */
function buildUrl(
  baseUrl: string,
  endpoint: string,
  params?: ParamRecord
): string {
  let url = `${baseUrl}${endpoint}`;
  if (!params) {
    return url;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.append(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  return url;
}

/**
 * Build form-encoded request body
 */
function buildFormBody(body?: ParamRecord): string | undefined {
  if (!body) {
    return undefined;
  }

  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      formData.append(key, String(value));
    }
  }

  return formData.toString();
}

/**
 * Handle HTTP response errors
 */
async function handleResponseError(response: Response): Promise<never> {
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    throw RateLimitError(
      retryAfter ? Number.parseInt(retryAfter, 10) : undefined
    );
  }

  if (response.status === 401) {
    throw AuthenticationError("Invalid credentials or token");
  }

  if (response.status === 403) {
    throw AuthenticationError("Insufficient permissions");
  }

  const errorText = await response.text();
  const errorMessage = parseErrorMessage(errorText);
  throw SonarQubeError(`API Error: ${errorMessage}`, "API_ERROR", response.status);
}

/**
 * Parse error message from response body
 */
function parseErrorMessage(errorText: string): string {
  try {
    const errorJson = JSON.parse(errorText) as { errors?: Array<{ msg: string }> };
    return errorJson.errors?.[0]?.msg ?? errorText;
  } catch {
    return errorText;
  }
}

/**
 * Parse JSON response body
 */
function parseResponseBody<T>(text: string): T {
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

/**
 * Handle fetch errors and wrap them appropriately
 */
function handleFetchError(error: unknown, baseUrl: string): never {
  // Check if it's already a SonarQube error by checking the code property
  if (error instanceof Error && "code" in error) {
    throw error;
  }

  if (error instanceof TypeError && error.message.includes("fetch")) {
    throw ConnectionError(`Cannot connect to SonarQube server at ${baseUrl}`);
  }

  throw SonarQubeError(
    `Request failed: ${error instanceof Error ? error.message : String(error)}`,
    "UNKNOWN_ERROR"
  );
}

/**
 * Remove trailing slashes from URL
 */
function normalizeUrl(url: string): string {
  let normalized = url;
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Build authorization header based on auth config
 */
function buildAuthHeader(auth: AuthConfig): string {
  if ("token" in auth) {
    const credentials = auth.token + ":";
    return `Basic ${btoa(credentials)}`;
  }
  const credentials = auth.user + ":" + auth.password;
  return `Basic ${btoa(credentials)}`;
}

/**
 * SonarQube API Client
 * Supports both token-based and user/password authentication
 */
export class SonarQubeClient {
  private readonly baseUrl: string;
  private readonly auth: AuthConfig;

  constructor(config: ClientConfig, _logger?: Logger) {
    this.baseUrl = normalizeUrl(config.url);
    this.auth = config.auth;
    // NOTE: No console.log here - it breaks the TUI!
  }

  /**
   * Make an authenticated request to the SonarQube API
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { method = "GET", params, body } = options;

    const url = buildUrl(this.baseUrl, endpoint, params);
    const requestBody = buildFormBody(body);

    const headers: Record<string, string> = {
      Authorization: buildAuthHeader(this.auth),
      Accept: "application/json",
    };

    if (requestBody) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: requestBody,
      });

      if (!response.ok) {
        await handleResponseError(response);
      }

      const text = await response.text();
      return parseResponseBody<T>(text);
    } catch (error) {
      handleFetchError(error, this.baseUrl);
    }
  }

  /**
   * Get the base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Check if the server is available
   */
  async getServerStatus(): Promise<ServerStatus> {
    return this.request<ServerStatus>("/api/system/status");
  }

  /**
   * Validate the authentication
   */
  async validateAuth(): Promise<AuthValidation> {
    return this.request<AuthValidation>("/api/authentication/validate");
  }

  /**
   * Get the server version
   */
  async getVersion(): Promise<string> {
    const url = buildUrl(this.baseUrl, "/api/server/version");
    const response = await fetch(url, {
      headers: { Authorization: buildAuthHeader(this.auth) },
    });
    return response.text();
  }

  /**
   * Check if the connection is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; version?: string; error?: string }> {
    try {
      const [status, auth] = await Promise.all([
        this.getServerStatus(),
        this.validateAuth(),
      ]);

      if (status.status !== "UP") {
        return {
          healthy: false,
          version: status.version,
          error: `Server status is ${status.status}`,
        };
      }

      if (!auth.valid) {
        return {
          healthy: false,
          version: status.version,
          error: "Authentication is invalid",
        };
      }

      return {
        healthy: true,
        version: status.version,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * GET request helper
   */
  get<T>(endpoint: string, params?: ParamRecord): Promise<T> {
    return this.request<T>(endpoint, { method: "GET", params });
  }

  /**
   * POST request helper
   */
  post<T>(endpoint: string, body?: ParamRecord, params?: ParamRecord): Promise<T> {
    return this.request<T>(endpoint, { method: "POST", body, params });
  }

  /**
   * DELETE request helper
   */
  delete<T>(endpoint: string, params?: ParamRecord): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE", params });
  }
}

/**
 * Create a SonarQube client with token auth
 */
export function createClientWithToken(
  url: string,
  token: string,
  logger?: Logger
): SonarQubeClient {
  return new SonarQubeClient({ url, auth: { token } }, logger);
}

/**
 * Create a SonarQube client with user/password auth
 */
export function createClientWithCredentials(
  url: string,
  user: string,
  password: string,
  logger?: Logger
): SonarQubeClient {
  return new SonarQubeClient({ url, auth: { user, password } }, logger);
}
