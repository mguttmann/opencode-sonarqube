/**
 * Tests for Base Handler Context
 */

import { describe, it, expect } from "bun:test";
import { createHandlerContext, type Handler } from "./base-handler.ts";
import type { SonarQubeConfig, ProjectState } from "../types/index.ts";

describe("Base Handler", () => {
  // Test fixtures
  const mockConfig: SonarQubeConfig = {
    url: "https://sonarqube.example.com",
    user: "admin",
    password: "admin123",
    level: "enterprise",
    autoAnalyze: true,
    sources: "src",
    newCodeDefinition: "previous_version",
  };

  const mockState: ProjectState = {
    projectKey: "test-project",
    projectToken: "sqa_test_token_12345",
    tokenName: "test-token",
    initializedAt: "2024-01-01T00:00:00.000Z",
    languages: ["typescript", "javascript"],
    setupComplete: true,
  };

  const testProjectKey = "test-project-key";
  const testDirectory = "/path/to/project";

  describe("createHandlerContext", () => {
    it("creates a handler context with all provided parameters", () => {
      const ctx = createHandlerContext(mockConfig, mockState, testProjectKey, testDirectory);

      expect(ctx.config).toBe(mockConfig);
      expect(ctx.state).toBe(mockState);
      expect(ctx.projectKey).toBe(testProjectKey);
      expect(ctx.directory).toBe(testDirectory);
    });

    it("creates an initialized API client", () => {
      const ctx = createHandlerContext(mockConfig, mockState, testProjectKey, testDirectory);

      expect(ctx.api).toBeDefined();
      expect(ctx.api.client).toBeDefined();
      expect(ctx.api.projects).toBeDefined();
      expect(ctx.api.issues).toBeDefined();
      expect(ctx.api.qualityGate).toBeDefined();
      expect(ctx.api.rules).toBeDefined();
      expect(ctx.api.sources).toBeDefined();
      expect(ctx.api.duplications).toBeDefined();
      expect(ctx.api.ce).toBeDefined();
      expect(ctx.api.analyses).toBeDefined();
      expect(ctx.api.profiles).toBeDefined();
      expect(ctx.api.branches).toBeDefined();
      expect(ctx.api.metrics).toBeDefined();
      expect(ctx.api.components).toBeDefined();
    });

    it("returns an object with correct structure", () => {
      const ctx = createHandlerContext(mockConfig, mockState, testProjectKey, testDirectory);

      // Verify the context has exactly the expected keys
      const keys = Object.keys(ctx);
      expect(keys).toContain("config");
      expect(keys).toContain("state");
      expect(keys).toContain("projectKey");
      expect(keys).toContain("directory");
      expect(keys).toContain("api");
      expect(keys.length).toBe(5);
    });

    it("allows different project keys to override state project key", () => {
      const overriddenProjectKey = "overridden-project";
      const ctx = createHandlerContext(mockConfig, mockState, overriddenProjectKey, testDirectory);

      // The context should use the explicitly provided project key
      expect(ctx.projectKey).toBe(overriddenProjectKey);
      // State should still have its original project key
      expect(ctx.state.projectKey).toBe("test-project");
    });

    it("works with minimal config values", () => {
      const minimalConfig: SonarQubeConfig = {
        url: "http://localhost:9000",
        user: "user",
        password: "pass",
        level: "relaxed",
        autoAnalyze: false,
        sources: ".",
        newCodeDefinition: "previous_version",
      };

      const minimalState: ProjectState = {
        projectKey: "minimal",
        projectToken: "token",
        tokenName: "name",
        initializedAt: new Date().toISOString(),
        languages: [],
        setupComplete: false,
      };

      const ctx = createHandlerContext(minimalConfig, minimalState, "key", "/dir");

      expect(ctx.config).toBe(minimalConfig);
      expect(ctx.state).toBe(minimalState);
      expect(ctx.api).toBeDefined();
    });
  });

  describe("Handler type", () => {
    it("supports typed handler functions", async () => {
      // Define a typed handler
      interface TestArgs {
        name: string;
        count: number;
      }

      const testHandler: Handler<TestArgs, string> = async (ctx, args) => {
        return `Project: ${ctx.projectKey}, Name: ${args.name}, Count: ${args.count}`;
      };

      const ctx = createHandlerContext(mockConfig, mockState, testProjectKey, testDirectory);
      const result = await testHandler(ctx, { name: "test", count: 42 });

      expect(result).toBe(`Project: ${testProjectKey}, Name: test, Count: 42`);
    });

    it("supports handlers with default generic types", async () => {
      // Handler with default unknown args type
      const defaultHandler: Handler = async (ctx) => {
        return ctx.directory;
      };

      const ctx = createHandlerContext(mockConfig, mockState, testProjectKey, testDirectory);
      const result = await defaultHandler(ctx, {});

      expect(result).toBe(testDirectory);
    });
  });
});
