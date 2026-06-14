/**
 * Integration Tests for Bootstrap Module
 * These tests run against a real SonarQube server
 * 
 * Required environment variables:
 * - SONAR_HOST_URL: SonarQube server URL (e.g., http://localhost:9000)
 * - SONAR_USER: Username (e.g., admin)
 * - SONAR_PASSWORD: Password
 * 
 * NOTE: This test creates temporary projects on the SonarQube server.
 * Cleanup runs automatically before and after tests to remove test-bootstrap-* projects.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  bootstrap,
  needsBootstrap,
  getProjectState,
  createAuthenticatedClient,
  disconnect,
} from "./index.ts";
import type { SonarQubeConfig } from "../types/index.ts";

// SonarQube server configuration from environment variables
const SONAR_URL = process.env.SONAR_HOST_URL ?? "";
const SONAR_USER = process.env.SONAR_USER ?? "";
const SONAR_PASSWORD = process.env.SONAR_PASSWORD ?? "";

// Skip all tests if credentials are not configured
const SKIP_TESTS = !SONAR_URL || !SONAR_USER || !SONAR_PASSWORD;

/**
 * Cleanup all test-bootstrap-* projects from SonarQube
 * This prevents accumulation of test projects on the server
 */
async function cleanupTestProjects(): Promise<number> {
  if (SKIP_TESTS) return 0;
  
  const auth = Buffer.from(`${SONAR_USER}:${SONAR_PASSWORD}`).toString("base64");
  
  try {
    // Search for all test-bootstrap-* projects
    const searchResponse = await fetch(
      `${SONAR_URL}/api/projects/search?q=test-bootstrap-&ps=500`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    
    if (!searchResponse.ok) {
      console.warn("[cleanup] Failed to search for test projects");
      return 0;
    }
    
    const searchData = await searchResponse.json() as { 
      components: Array<{ key: string }> 
    };
    
    const testProjects = searchData.components.filter(
      (p) => p.key.startsWith("test-bootstrap-")
    );
    
    if (testProjects.length === 0) {
      return 0;
    }
    
    // Delete each test project
    let deletedCount = 0;
    for (const project of testProjects) {
      const deleteResponse = await fetch(
        `${SONAR_URL}/api/projects/delete?project=${encodeURIComponent(project.key)}`,
        { 
          method: "POST",
          headers: { Authorization: `Basic ${auth}` } 
        }
      );
      
      if (deleteResponse.ok) {
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[cleanup] Deleted ${deletedCount} test-bootstrap-* projects`);
    }
    
    return deletedCount;
  } catch (error) {
    console.warn("[cleanup] Error during cleanup:", error);
    return 0;
  }
}

const TEST_CONFIG: SonarQubeConfig = {
  url: SONAR_URL,
  user: SONAR_USER,
  password: SONAR_PASSWORD,
  level: "enterprise",
  autoAnalyze: false,
  newCodeDefinition: "previous_version",
  sources: "src",
};

describe.skipIf(SKIP_TESTS)("Integration Tests - Bootstrap Module", () => {
  let tempDir: string;
  let testProjectKey: string;

  beforeAll(async () => {
    // Clean up any leftover test projects from previous runs
    await cleanupTestProjects();
    
    // Create temp directory for test project
    tempDir = await mkdtemp(join(tmpdir(), "bootstrap-integration-"));
    
    // Create a unique test project key
    testProjectKey = `test-bootstrap-${Date.now()}`;
    
    // Create a minimal package.json so project detection works
    await Bun.write(
      join(tempDir, "package.json"),
      JSON.stringify({ name: testProjectKey, version: "1.0.0" })
    );
    
    // Create tsconfig.json to ensure TypeScript detection
    await Bun.write(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2020" } })
    );
    
    // Create a src directory with a test file
    const srcDir = join(tempDir, "src");
    await Bun.write(join(srcDir, "index.ts"), "export const hello: string = 'world';");
  });

  afterAll(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
    
    // Clean up test projects from SonarQube server
    await cleanupTestProjects();
  });

  describe("needsBootstrap", () => {
    test("returns true for new project directory", async () => {
      const needs = await needsBootstrap(tempDir);
      expect(needs).toBe(true);
    });
  });

  describe("bootstrap", () => {
    test("bootstraps a new project successfully", async () => {
      const result = await bootstrap({
        config: {
          ...TEST_CONFIG,
          projectKey: testProjectKey,
          projectName: "Bootstrap Integration Test",
        },
        directory: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.projectKey).toBe(testProjectKey);
      expect(result.projectToken).toBeDefined();
      expect(result.projectToken!.length).toBeGreaterThan(0);
      expect(result.languages?.some(l => l === "typescript" || l === "javascript")).toBe(true);
      expect(result.isNewProject).toBe(true);
    });

    test("returns existing project on second bootstrap", async () => {
      const result = await bootstrap({
        config: {
          ...TEST_CONFIG,
          projectKey: testProjectKey,
        },
        directory: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.isNewProject).toBe(false);
      expect(result.message).toContain("already configured");
    });
  });

  describe("getProjectState", () => {
    test("returns state after bootstrap", async () => {
      const state = await getProjectState(tempDir);

      expect(state).not.toBeNull();
      expect(state?.projectKey).toBe(testProjectKey);
      expect(state?.projectToken).toBeDefined();
      expect(state?.setupComplete).toBe(true);
      expect(state?.languages?.some(l => l === "typescript" || l === "javascript")).toBe(true);
    });
  });

  describe("createAuthenticatedClient", () => {
    // Skip: Flaky in CI due to network issues between GitHub Actions and SonarQube server
    test.skip("creates client with stored token", async () => {
      const client = await createAuthenticatedClient(TEST_CONFIG, tempDir);

      expect(client).not.toBeNull();
      
      // Verify the client can connect (retry up to 3 times for flaky network)
      let healthy = false;
      for (let i = 0; i < 3; i++) {
        const health = await client!.healthCheck();
        if (health.healthy) {
          healthy = true;
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      expect(healthy).toBe(true);
    });
  });

  describe("needsBootstrap after setup", () => {
    test("returns false after bootstrap", async () => {
      const needs = await needsBootstrap(tempDir);
      expect(needs).toBe(false);
    });
  });

  describe("disconnect", () => {
    test("removes local state", async () => {
      await disconnect(tempDir);

      const state = await getProjectState(tempDir);
      expect(state).toBeNull();

      // needsBootstrap should return true again
      const needs = await needsBootstrap(tempDir);
      expect(needs).toBe(true);
    });
  });
});
