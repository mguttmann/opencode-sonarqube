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
});
