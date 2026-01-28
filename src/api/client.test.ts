/**
 * Tests for SonarQube API client
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  SonarQubeClient,
  createClientWithToken,
  createClientWithCredentials,
} from "./client.ts";
// Error factory functions are no longer needed in imports since we use toMatchObject

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe("SonarQubeClient", () => {
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: "UP", version: "10.0" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("constructor", () => {
    test("normalizes URL by removing trailing slashes", () => {
      const client = new SonarQubeClient({
        url: "https://sonar.example.com///",
        auth: { token: "test-token" },
      });

      expect(client.getBaseUrl()).toBe("https://sonar.example.com");
    });

    test("accepts token authentication", () => {
      const client = createClientWithToken("https://sonar.example.com", "test-token");
      expect(client).toBeInstanceOf(SonarQubeClient);
    });

    test("accepts credentials authentication", () => {
      const client = createClientWithCredentials(
        "https://sonar.example.com",
        "admin",
        "password"
      );
      expect(client).toBeInstanceOf(SonarQubeClient);
    });
  });

  describe("getServerStatus", () => {
    test("returns server status", async () => {
      const client = createClientWithToken("https://sonar.example.com", "token");

      const status = await client.getServerStatus();

      expect(status.status).toBe("UP");
      expect(status.version).toBe("10.0");
    });

    test("includes authorization header with token", async () => {
      const client = createClientWithToken("https://sonar.example.com", "my-token");

      await client.getServerStatus();

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      const headers = call[1].headers;
      expect(headers.Authorization).toContain("Basic");
    });
  });

  describe("validateAuth", () => {
    test("returns validation result", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ valid: true }), { status: 200 })
        )
      );

      const client = createClientWithToken("https://sonar.example.com", "token");
      const result = await client.validateAuth();

      expect(result.valid).toBe(true);
    });
  });

  describe("getVersion", () => {
    test("returns server version", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response("10.2.1", { status: 200 })
        )
      );

      const client = createClientWithToken("https://sonar.example.com", "token");
      const version = await client.getVersion();

      expect(version).toBe("10.2.1");
    });
  });

  describe("healthCheck", () => {
    test("returns healthy when server is up and auth is valid", async () => {
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response(JSON.stringify({ status: "UP", version: "10.0" }), { status: 200 })
          )
        )
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response(JSON.stringify({ valid: true }), { status: 200 })
          )
        );

      const client = createClientWithToken("https://sonar.example.com", "token");
      const result = await client.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.version).toBe("10.0");
    });

    test("returns unhealthy when server is not UP", async () => {
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response(JSON.stringify({ status: "STARTING", version: "10.0" }), {
              status: 200,
            })
          )
        )
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response(JSON.stringify({ valid: true }), { status: 200 })
          )
        );

      const client = createClientWithToken("https://sonar.example.com", "token");
      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain("STARTING");
    });

    test("returns unhealthy when auth is invalid", async () => {
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response(JSON.stringify({ status: "UP", version: "10.0" }), { status: 200 })
          )
        )
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response(JSON.stringify({ valid: false }), { status: 200 })
          )
        );

      const client = createClientWithToken("https://sonar.example.com", "token");
      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain("invalid");
    });

    test("returns unhealthy on connection error", async () => {
      mockFetch.mockImplementation(() =>
        Promise.reject(new TypeError("fetch failed"))
      );

      const client = createClientWithToken("https://sonar.example.com", "token");
      const result = await client.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("error handling", () => {
    test("throws AuthenticationError on 401", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(new Response("", { status: 401 }))
      );

      const client = createClientWithToken("https://sonar.example.com", "token");

      await expect(client.getServerStatus()).rejects.toMatchObject({
        name: "AuthenticationError",
        message: "Invalid credentials or token",
      });
    });

    test("throws AuthenticationError on 403", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(new Response("", { status: 403 }))
      );

      const client = createClientWithToken("https://sonar.example.com", "token");

      await expect(client.getServerStatus()).rejects.toMatchObject({
        name: "AuthenticationError",
        message: "Insufficient permissions",
      });
    });

    test("throws RateLimitError on 429", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response("", {
            status: 429,
            headers: { "Retry-After": "60" },
          })
        )
      );

      const client = createClientWithToken("https://sonar.example.com", "token");

      await expect(client.getServerStatus()).rejects.toMatchObject({
        name: "RateLimitError",
        message: "Rate limit exceeded. Retry after 60s",
      });
    });

    test("throws ConnectionError on network failure", async () => {
      mockFetch.mockImplementation(() =>
        Promise.reject(new TypeError("fetch failed"))
      );

      const client = createClientWithToken("https://sonar.example.com", "token");

      await expect(client.getServerStatus()).rejects.toMatchObject({
        name: "ConnectionError",
        message: "Cannot connect to SonarQube server at https://sonar.example.com",
      });
    });
  });

  describe("HTTP methods", () => {
    test("get() makes GET request", async () => {
      const client = createClientWithToken("https://sonar.example.com", "token");
      await client.get("/api/test");

      expect(mockFetch.mock.calls[0][1].method).toBe("GET");
    });

    test("post() makes POST request with body", async () => {
      const client = createClientWithToken("https://sonar.example.com", "token");
      await client.post("/api/test", { key: "value" });

      const call = mockFetch.mock.calls[0];
      expect(call[1].method).toBe("POST");
      expect(call[1].body).toContain("key=value");
    });

    test("delete() makes DELETE request", async () => {
      const client = createClientWithToken("https://sonar.example.com", "token");
      await client.delete("/api/test");

      expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
    });

    test("includes query parameters in URL", async () => {
      const client = createClientWithToken("https://sonar.example.com", "token");
      await client.get("/api/test", { foo: "bar", num: 123 });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("?foo=bar&num=123");
    });

    test("skips undefined parameters", async () => {
      const client = createClientWithToken("https://sonar.example.com", "token");
      await client.get("/api/test", { foo: "bar", skip: undefined });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("foo=bar");
      expect(url).not.toContain("skip");
    });
  });
});
