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
  /** Maximum number of retries for failed requests (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  retryDelay?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/** Default retry configuration */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;
const DEFAULT_TIMEOUT = 30000;

/** HTTP status codes that should trigger a retry */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

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
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number, baseDelay: number): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown, statusCode?: number): boolean {
  // Network/connection errors are retryable
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  
  // Check status code
  if (statusCode && RETRYABLE_STATUS_CODES.has(statusCode)) {
    return true;
  }
  
  // Connection errors are retryable
  if (error instanceof Error && "code" in error) {
    const errorCode = (error as { code: string }).code;
    return errorCode === "CONNECTION_ERROR";
  }
  
  return false;
}

/** Result of a single fetch attempt */
type FetchAttemptResult<T> = 
  | { success: true; data: T }
  | { success: false; shouldRetry: boolean; statusCode?: number; waitTime?: number; error?: unknown };

/**
 * Get retry wait time for rate limit response
 */
function getRateLimitWaitTime(response: Response, attempt: number, baseDelay: number): number {
  const retryAfter = response.headers.get("Retry-After");
  return retryAfter 
    ? Number.parseInt(retryAfter, 10) * 1000 
    : calculateBackoffDelay(attempt, baseDelay);
}

/**
 * SonarQube API Client
 * Supports both token-based and user/password authentication
 * Includes automatic retry with exponential backoff for transient errors
 */
export class SonarQubeClient {
  private readonly baseUrl: string;
  private readonly auth: AuthConfig;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly timeout: number;

  constructor(config: ClientConfig, _logger?: Logger) {
    this.baseUrl = normalizeUrl(config.url);
    this.auth = config.auth;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelay = config.retryDelay ?? DEFAULT_RETRY_DELAY;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Execute a single fetch attempt with timeout
   */
  private async executeRequest<T>(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    attempt: number
  ): Promise<FetchAttemptResult<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(url, { method, headers, body, signal: controller.signal });
      clearTimeout(timeoutId);
      
      return this.processResponse<T>(response, attempt);
    } catch (error) {
      clearTimeout(timeoutId);
      return this.handleFetchException(error);
    }
  }

  /**
   * Process HTTP response and determine if retry is needed
   */
  private async processResponse<T>(response: Response, attempt: number): Promise<FetchAttemptResult<T>> {
    if (response.ok) {
      const text = await response.text();
      return { success: true, data: parseResponseBody<T>(text) };
    }
    
    const canRetry = attempt < this.maxRetries && RETRYABLE_STATUS_CODES.has(response.status);
    
    if (!canRetry) {
      await handleResponseError(response);
      // handleResponseError always throws, but TypeScript doesn't know that
      throw new Error("Unreachable");
    }
    
    const waitTime = response.status === 429
      ? getRateLimitWaitTime(response, attempt, this.retryDelay)
      : calculateBackoffDelay(attempt, this.retryDelay);
    
    return { success: false, shouldRetry: true, statusCode: response.status, waitTime };
  }

  /**
   * Handle exceptions during fetch
   */
  private handleFetchException(error: unknown): FetchAttemptResult<never> {
    // Timeout errors should not retry
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, shouldRetry: false, error };
    }
    
    // Check if error is retryable
    return { 
      success: false, 
      shouldRetry: isRetryableError(error), 
      error 
    };
  }

  /**
   * Make an authenticated request to the SonarQube API with retry support
   */
  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
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

    let lastError: unknown;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const result = await this.executeRequest<T>(url, method, headers, requestBody, attempt);
      
      if (result.success) {
        return result.data;
      }
      
      lastError = result.error;
      
      if (result.shouldRetry && attempt < this.maxRetries) {
        await sleep(result.waitTime ?? calculateBackoffDelay(attempt, this.retryDelay));
        continue;
      }
      
      // Handle timeout specifically
      if (result.error instanceof Error && result.error.name === "AbortError") {
        throw ConnectionError(`Request to ${endpoint} timed out after ${this.timeout}ms`);
      }
      
      handleFetchError(result.error, this.baseUrl);
    }
    
    handleFetchError(lastError, this.baseUrl);
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

/** Additional options for client creation */
export interface ClientOptions {
  /** Maximum number of retries for failed requests (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  retryDelay?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Create a SonarQube client with token auth
 */
export function createClientWithToken(
  url: string,
  token: string,
  logger?: Logger,
  options?: ClientOptions
): SonarQubeClient {
  return new SonarQubeClient({ url, auth: { token }, ...options }, logger);
}

/**
 * Create a SonarQube client with user/password auth
 */
export function createClientWithCredentials(
  url: string,
  user: string,
  password: string,
  logger?: Logger,
  options?: ClientOptions
): SonarQubeClient {
  return new SonarQubeClient({ url, auth: { user, password }, ...options }, logger);
}
