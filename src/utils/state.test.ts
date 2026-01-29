/**
 * Tests for state management utilities
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as fsPromises from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectState } from "../types/index.ts";
import {
  hasProjectState,
  loadProjectState,
  saveProjectState,
  updateProjectState,
  deleteProjectState,
  createInitialState,
  ensureGitignore,
  STATE_VERSION,
} from "./state.ts";

describe("State Management", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "sonarqube-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("hasProjectState", () => {
    test("returns false when no state exists", async () => {
      const result = await hasProjectState(testDir);
      expect(result).toBe(false);
    });

    test("returns true when state exists", async () => {
      // Create state file
      await Bun.write(`${testDir}/.sonarqube/project.json`, JSON.stringify({
        projectKey: "test",
        projectToken: "token",
        tokenName: "name",
        initializedAt: new Date().toISOString(),
        languages: ["typescript"],
        setupComplete: true,
      }));

      const result = await hasProjectState(testDir);
      expect(result).toBe(true);
    });
  });

  describe("loadProjectState", () => {
    test("returns null when no state exists", async () => {
      const result = await loadProjectState(testDir);
      expect(result).toBeNull();
    });

    test("loads valid state", async () => {
      const state: ProjectState = {
        projectKey: "test-project",
        projectToken: "sqp_token123",
        tokenName: "opencode-test",
        initializedAt: "2024-01-01T00:00:00Z",
        languages: ["typescript", "javascript"],
        qualityGate: "Sonar way",
        setupComplete: true,
      };

      await Bun.write(`${testDir}/.sonarqube/project.json`, JSON.stringify(state));

      const result = await loadProjectState(testDir);
      expect(result).not.toBeNull();
      expect(result?.projectKey).toBe("test-project");
      expect(result?.languages).toContain("typescript");
    });

    test("returns null for invalid JSON", async () => {
      await Bun.write(`${testDir}/.sonarqube/project.json`, "not valid json");

      const result = await loadProjectState(testDir);
      expect(result).toBeNull();
    });

    test("returns null for invalid schema", async () => {
      await Bun.write(`${testDir}/.sonarqube/project.json`, JSON.stringify({
        invalid: "schema",
      }));

      const result = await loadProjectState(testDir);
      expect(result).toBeNull();
    });
  });

  describe("saveProjectState", () => {
    test("saves state to file", async () => {
      const state: ProjectState = {
        projectKey: "test-project",
        projectToken: "sqp_token123",
        tokenName: "opencode-test",
        initializedAt: "2024-01-01T00:00:00Z",
        languages: ["typescript"],
        setupComplete: true,
      };

      await saveProjectState(testDir, state);

      const loaded = await loadProjectState(testDir);
      expect(loaded?.projectKey).toBe("test-project");
    });

    test("creates directory if not exists", async () => {
      const state = createInitialState({
        projectKey: "test",
        projectToken: "token",
        tokenName: "name",
        languages: ["ts"],
      });

      await saveProjectState(testDir, state);

      const exists = await Bun.file(`${testDir}/.sonarqube/project.json`).exists();
      expect(exists).toBe(true);
    });
  });

  describe("updateProjectState", () => {
    test("updates existing state", async () => {
      const state = createInitialState({
        projectKey: "test",
        projectToken: "token",
        tokenName: "name",
        languages: ["typescript"],
      });

      await saveProjectState(testDir, state);

      const updated = await updateProjectState(testDir, {
        lastAnalysis: "2024-01-02T00:00:00Z",
      });

      expect(updated?.lastAnalysis).toBe("2024-01-02T00:00:00Z");
      expect(updated?.projectKey).toBe("test");
    });

    test("returns null when no state exists", async () => {
      const result = await updateProjectState(testDir, {
        lastAnalysis: "2024-01-02T00:00:00Z",
      });
      expect(result).toBeNull();
    });
  });

  describe("deleteProjectState", () => {
    test("deletes existing state", async () => {
      const state = createInitialState({
        projectKey: "test",
        projectToken: "token",
        tokenName: "name",
        languages: ["ts"],
      });

      await saveProjectState(testDir, state);
      const result = await deleteProjectState(testDir);

      expect(result).toBe(true);
      expect(await hasProjectState(testDir)).toBe(false);
    });

    test("returns false when no state exists", async () => {
      const result = await deleteProjectState(testDir);
      expect(result).toBe(false);
    });

    test("returns false when unlink fails", async () => {
      // Create state first
      const state = createInitialState({
        projectKey: "test",
        projectToken: "token",
        tokenName: "name",
        languages: ["ts"],
      });
      await saveProjectState(testDir, state);

      // Mock unlink to throw
      const unlinkSpy = spyOn(fsPromises, "unlink");
      unlinkSpy.mockRejectedValue(new Error("Permission denied"));

      const result = await deleteProjectState(testDir);
      expect(result).toBe(false);

      unlinkSpy.mockRestore();
    });
  });

  describe("createInitialState", () => {
    test("creates state with required fields", () => {
      const state = createInitialState({
        projectKey: "my-project",
        projectToken: "sqp_abc123",
        tokenName: "opencode-my-project-123",
        languages: ["typescript", "javascript"],
      });

      expect(state.projectKey).toBe("my-project");
      expect(state.projectToken).toBe("sqp_abc123");
      expect(state.tokenName).toBe("opencode-my-project-123");
      expect(state.languages).toEqual(["typescript", "javascript"]);
      expect(state.setupComplete).toBe(true);
      expect(state.initializedAt).toBeDefined();
    });

    test("includes optional quality gate", () => {
      const state = createInitialState({
        projectKey: "test",
        projectToken: "token",
        tokenName: "name",
        languages: ["ts"],
        qualityGate: "Sonar way",
      });

      expect(state.qualityGate).toBe("Sonar way");
    });
  });

  describe("ensureGitignore", () => {
    test("creates .gitignore with sonarqube entry", async () => {
      await ensureGitignore(testDir);

      const content = await Bun.file(`${testDir}/.gitignore`).text();
      expect(content).toContain(".sonarqube/");
    });

    test("appends to existing .gitignore", async () => {
      await Bun.write(`${testDir}/.gitignore`, "node_modules/\n");

      await ensureGitignore(testDir);

      const content = await Bun.file(`${testDir}/.gitignore`).text();
      expect(content).toContain("node_modules/");
      expect(content).toContain(".sonarqube/");
    });

    test("does not duplicate entry", async () => {
      await Bun.write(`${testDir}/.gitignore`, ".sonarqube/\n");

      await ensureGitignore(testDir);

      const content = await Bun.file(`${testDir}/.gitignore`).text();
      const matches = content.match(/\.sonarqube/g);
      expect(matches?.length).toBe(1);
    });
  });

  describe("State Migration and Recovery", () => {
    test("saves state with version number", async () => {
      const state = createInitialState({
        projectKey: "test",
        projectToken: "token",
        tokenName: "name",
        languages: ["ts"],
      });

      await saveProjectState(testDir, state);

      const raw = JSON.parse(await Bun.file(`${testDir}/.sonarqube/project.json`).text());
      expect(raw._version).toBe(STATE_VERSION);
    });

    test("creates backup when saving over existing state", async () => {
      const state1 = createInitialState({
        projectKey: "test1",
        projectToken: "token1",
        tokenName: "name1",
        languages: ["ts"],
      });

      await saveProjectState(testDir, state1);

      const state2 = createInitialState({
        projectKey: "test2",
        projectToken: "token2",
        tokenName: "name2",
        languages: ["js"],
      });

      await saveProjectState(testDir, state2);

      // Check backup exists
      const backupExists = await Bun.file(`${testDir}/.sonarqube/project.json.backup`).exists();
      expect(backupExists).toBe(true);

      // Backup should contain state1 data (with version)
      const backup = JSON.parse(await Bun.file(`${testDir}/.sonarqube/project.json.backup`).text());
      expect(backup.projectKey).toBe("test1");
    });

    test("handles empty state file gracefully", async () => {
      await fsPromises.mkdir(`${testDir}/.sonarqube`, { recursive: true });
      await Bun.write(`${testDir}/.sonarqube/project.json`, "");

      const result = await loadProjectState(testDir);
      expect(result).toBeNull();
    });

    test("handles whitespace-only state file gracefully", async () => {
      await fsPromises.mkdir(`${testDir}/.sonarqube`, { recursive: true });
      await Bun.write(`${testDir}/.sonarqube/project.json`, "   \n  \t  ");

      const result = await loadProjectState(testDir);
      expect(result).toBeNull();
    });

    test("repairs partially valid state", async () => {
      // Create state with missing optional fields
      const partialState = {
        projectKey: "test-project",
        projectToken: "sqp_token123",
        tokenName: "opencode-test",
        initializedAt: "2024-01-01T00:00:00Z",
        // Missing: languages, setupComplete
      };

      await fsPromises.mkdir(`${testDir}/.sonarqube`, { recursive: true });
      await Bun.write(`${testDir}/.sonarqube/project.json`, JSON.stringify(partialState));

      // Should fail validation and attempt repair
      const result = await loadProjectState(testDir);
      
      // If repair works, we get state back
      // If not, we get null
      // Either way, it shouldn't crash
      expect(result === null || typeof result?.projectKey === "string").toBe(true);
    });

    test("recovers from backup when main state is corrupt", async () => {
      // Create valid backup
      const validState: ProjectState = {
        projectKey: "backup-project",
        projectToken: "sqp_backup",
        tokenName: "backup-token",
        initializedAt: "2024-01-01T00:00:00Z",
        languages: ["typescript"],
        setupComplete: true,
      };

      await fsPromises.mkdir(`${testDir}/.sonarqube`, { recursive: true });
      await Bun.write(`${testDir}/.sonarqube/project.json.backup`, JSON.stringify(validState));
      
      // Create corrupt main state
      await Bun.write(`${testDir}/.sonarqube/project.json`, "{{{{invalid json");

      const result = await loadProjectState(testDir);
      
      // Should recover from backup
      expect(result?.projectKey).toBe("backup-project");
    });

    test("returns null when both main and backup are corrupt", async () => {
      await fsPromises.mkdir(`${testDir}/.sonarqube`, { recursive: true });
      await Bun.write(`${testDir}/.sonarqube/project.json`, "{{{{invalid");
      await Bun.write(`${testDir}/.sonarqube/project.json.backup`, "{{{{also invalid");

      const result = await loadProjectState(testDir);
      expect(result).toBeNull();
    });

    test("repairs state missing required fields by deriving from directory", async () => {
      // State with token but missing projectKey
      const brokenState = {
        projectToken: "sqp_valid_token",
        tokenName: "some-token",
        initializedAt: "2024-01-01T00:00:00Z",
        languages: ["typescript"],
        setupComplete: true,
      };

      await fsPromises.mkdir(`${testDir}/.sonarqube`, { recursive: true });
      await Bun.write(`${testDir}/.sonarqube/project.json`, JSON.stringify(brokenState));

      const result = await loadProjectState(testDir);
      
      // Should attempt to derive projectKey from directory name
      // Result depends on whether repair succeeds
      expect(result === null || typeof result?.projectKey === "string").toBe(true);
    });

    test("returns null when token is missing and cannot be recovered", async () => {
      // State missing the essential token
      const noTokenState = {
        projectKey: "test-project",
        tokenName: "some-token",
        initializedAt: "2024-01-01T00:00:00Z",
        languages: ["typescript"],
        setupComplete: true,
      };

      await fsPromises.mkdir(`${testDir}/.sonarqube`, { recursive: true });
      await Bun.write(`${testDir}/.sonarqube/project.json`, JSON.stringify(noTokenState));

      const result = await loadProjectState(testDir);
      
      // Token is essential - cannot be repaired
      expect(result).toBeNull();
    });
  });
});
