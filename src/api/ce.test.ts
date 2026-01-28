/**
 * Tests for SonarQube Compute Engine (CE) API
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { ComputeEngineAPI } from "./ce.ts";
import type { SonarQubeClient } from "./client.ts";

// Mock client
const createMockClient = () => {
  return {
    get: mock(() => Promise.resolve({})),
    post: mock(() => Promise.resolve({})),
  } as unknown as SonarQubeClient;
};

describe("ComputeEngineAPI", () => {
  let client: ReturnType<typeof createMockClient>;
  let ce: ComputeEngineAPI;

  beforeEach(() => {
    client = createMockClient();
    ce = new ComputeEngineAPI(client);
  });

  describe("getTask", () => {
    test("fetches task by ID", async () => {
      const mockTask = {
        id: "task-123",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "SUCCESS" as const,
        submittedAt: "2026-01-24T10:00:00Z",
        executedAt: "2026-01-24T10:01:00Z",
        executionTimeMs: 5000,
      };

      (client.get as ReturnType<typeof mock>).mockResolvedValue({ task: mockTask });

      const result = await ce.getTask("task-123");

      expect(result).toEqual(mockTask);
      expect(client.get).toHaveBeenCalledWith("/api/ce/task", { id: "task-123" });
    });

    test("returns undefined on error", async () => {
      (client.get as ReturnType<typeof mock>).mockRejectedValue(new Error("Not found"));

      const result = await ce.getTask("invalid-task");

      expect(result).toBeUndefined();
    });
  });

  describe("getComponentTasks", () => {
    test("fetches current and queued tasks", async () => {
      const mockCurrent = {
        id: "task-1",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "IN_PROGRESS" as const,
        submittedAt: "2026-01-24T10:00:00Z",
      };
      const mockQueue = [
        {
          id: "task-2",
          type: "REPORT",
          componentKey: "my-project",
          componentName: "My Project",
          status: "PENDING" as const,
          submittedAt: "2026-01-24T10:01:00Z",
        },
      ];

      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        current: mockCurrent,
        queue: mockQueue,
      });

      const result = await ce.getComponentTasks("my-project");

      expect(result.current).toEqual(mockCurrent);
      expect(result.queue).toEqual(mockQueue);
    });

    test("returns empty queue on error", async () => {
      (client.get as ReturnType<typeof mock>).mockRejectedValue(new Error("Error"));

      const result = await ce.getComponentTasks("my-project");

      expect(result.current).toBeUndefined();
      expect(result.queue).toEqual([]);
    });
  });

  describe("getActivity", () => {
    test("fetches activity with options", async () => {
      const mockTasks = [
        {
          id: "task-1",
          type: "REPORT",
          componentKey: "my-project",
          componentName: "My Project",
          status: "SUCCESS" as const,
          submittedAt: "2026-01-24T10:00:00Z",
        },
      ];

      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        tasks: mockTasks,
        paging: { pageIndex: 1, pageSize: 20, total: 1 },
      });

      const result = await ce.getActivity({
        componentKey: "my-project",
        status: "SUCCESS",
        onlyCurrents: true,
        pageSize: 10,
      });

      expect(result).toEqual(mockTasks);
      expect(client.get).toHaveBeenCalledWith("/api/ce/activity", {
        component: "my-project",
        status: "SUCCESS",
        onlyCurrents: "true",
        maxExecutedAt: undefined,
        minSubmittedAt: undefined,
        ps: 10,
      });
    });

    test("returns empty array on error", async () => {
      (client.get as ReturnType<typeof mock>).mockRejectedValue(new Error("Error"));

      const result = await ce.getActivity({ componentKey: "my-project" });

      expect(result).toEqual([]);
    });
  });

  describe("getLatestTask", () => {
    test("returns the first task from activity", async () => {
      const mockTask = {
        id: "task-1",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "SUCCESS" as const,
        submittedAt: "2026-01-24T10:00:00Z",
      };

      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        tasks: [mockTask],
        paging: { pageIndex: 1, pageSize: 1, total: 1 },
      });

      const result = await ce.getLatestTask("my-project");

      expect(result).toEqual(mockTask);
    });

    test("returns undefined when no tasks", async () => {
      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        tasks: [],
        paging: { pageIndex: 1, pageSize: 1, total: 0 },
      });

      const result = await ce.getLatestTask("my-project");

      expect(result).toBeUndefined();
    });
  });

  describe("isAnalysisInProgress", () => {
    test("returns true when current task exists", async () => {
      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        current: { id: "task-1", status: "IN_PROGRESS" },
        queue: [],
      });

      const result = await ce.isAnalysisInProgress("my-project");

      expect(result).toBe(true);
    });

    test("returns true when queue is not empty", async () => {
      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        queue: [{ id: "task-1", status: "PENDING" }],
      });

      const result = await ce.isAnalysisInProgress("my-project");

      expect(result).toBe(true);
    });

    test("returns false when no current task and empty queue", async () => {
      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        queue: [],
      });

      const result = await ce.isAnalysisInProgress("my-project");

      expect(result).toBe(false);
    });
  });

  describe("waitForTask", () => {
    test("returns task when found and completed immediately", async () => {
      const mockTask = {
        id: "task-123",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "SUCCESS" as const,
        submittedAt: "2026-01-24T10:00:00Z",
      };

      (client.get as ReturnType<typeof mock>).mockResolvedValue({ task: mockTask });

      const result = await ce.waitForTask("task-123", 100, 1000);

      expect(result).toEqual(mockTask);
    });

    test("returns task when status is FAILED", async () => {
      const mockTask = {
        id: "task-123",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "FAILED" as const,
        submittedAt: "2026-01-24T10:00:00Z",
        errorMessage: "Analysis failed",
      };

      (client.get as ReturnType<typeof mock>).mockResolvedValue({ task: mockTask });

      const result = await ce.waitForTask("task-123", 100, 1000);

      expect(result?.status).toBe("FAILED");
    });

    test("returns task when status is CANCELED", async () => {
      const mockTask = {
        id: "task-123",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "CANCELED" as const,
        submittedAt: "2026-01-24T10:00:00Z",
      };

      (client.get as ReturnType<typeof mock>).mockResolvedValue({ task: mockTask });

      const result = await ce.waitForTask("task-123", 100, 1000);

      expect(result?.status).toBe("CANCELED");
    });

    test("polls until task completes", async () => {
      let callCount = 0;
      (client.get as ReturnType<typeof mock>).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            task: {
              id: "task-123",
              type: "REPORT",
              componentKey: "my-project",
              componentName: "My Project",
              status: "IN_PROGRESS" as const,
              submittedAt: "2026-01-24T10:00:00Z",
            },
          };
        }
        return {
          task: {
            id: "task-123",
            type: "REPORT",
            componentKey: "my-project",
            componentName: "My Project",
            status: "SUCCESS" as const,
            submittedAt: "2026-01-24T10:00:00Z",
          },
        };
      });

      const result = await ce.waitForTask("task-123", 50, 5000);

      expect(result?.status).toBe("SUCCESS");
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    test("retries when task not found initially", async () => {
      let callCount = 0;
      (client.get as ReturnType<typeof mock>).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Not found");
        }
        return {
          task: {
            id: "task-123",
            type: "REPORT",
            componentKey: "my-project",
            componentName: "My Project",
            status: "SUCCESS" as const,
            submittedAt: "2026-01-24T10:00:00Z",
          },
        };
      });

      const result = await ce.waitForTask("task-123", 50, 5000);

      expect(result?.status).toBe("SUCCESS");
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    test("returns undefined after max retries when task not found", async () => {
      (client.get as ReturnType<typeof mock>).mockRejectedValue(new Error("Not found"));

      const result = await ce.waitForTask("invalid-task", 50, 5000);

      expect(result).toBeUndefined();
    });

    test("returns undefined on timeout", async () => {
      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        task: {
          id: "task-123",
          status: "IN_PROGRESS" as const,
          type: "REPORT",
          componentKey: "my-project",
          componentName: "My Project",
          submittedAt: "2026-01-24T10:00:00Z",
        },
      });

      const result = await ce.waitForTask("task-123", 50, 150);

      expect(result).toBeUndefined();
    });
  });

  describe("waitForAnalysis", () => {
    test("returns immediately when task is already complete", async () => {
      const mockTask = {
        id: "task-1",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "SUCCESS" as const,
        submittedAt: "2026-01-24T10:00:00Z",
      };

      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        current: mockTask,
        queue: [],
      });

      const result = await ce.waitForAnalysis("my-project", 1000, 100);

      expect(result).toEqual(mockTask);
    });

    test("returns when task transitions to FAILED", async () => {
      const mockTask = {
        id: "task-1",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "FAILED" as const,
        submittedAt: "2026-01-24T10:00:00Z",
        errorMessage: "Analysis failed",
      };

      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        current: mockTask,
        queue: [],
      });

      const result = await ce.waitForAnalysis("my-project", 1000, 100);

      expect(result?.status).toBe("FAILED");
    });

    test("returns when task transitions to CANCELED", async () => {
      const mockTask = {
        id: "task-1",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "CANCELED" as const,
        submittedAt: "2026-01-24T10:00:00Z",
      };

      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        current: mockTask,
        queue: [],
      });

      const result = await ce.waitForAnalysis("my-project", 1000, 100);

      expect(result?.status).toBe("CANCELED");
    });

    test("polls until task completes", async () => {
      let callCount = 0;
      (client.get as ReturnType<typeof mock>).mockImplementation(async (endpoint: string) => {
        callCount++;
        if (endpoint === "/api/ce/component") {
          if (callCount < 3) {
            return {
              current: { id: "task-1", status: "IN_PROGRESS" },
              queue: [],
            };
          }
          return {
            current: { id: "task-1", status: "SUCCESS", componentKey: "my-project", componentName: "My Project", type: "REPORT", submittedAt: "2026-01-24T10:00:00Z" },
            queue: [],
          };
        }
        return { task: { id: "task-1", status: "SUCCESS" } };
      });

      const result = await ce.waitForAnalysis("my-project", 5000, 50);

      expect(result?.status).toBe("SUCCESS");
      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    test("fetches final task status when current becomes undefined", async () => {
      let callCount = 0;
      (client.get as ReturnType<typeof mock>).mockImplementation(async (endpoint: string) => {
        callCount++;
        if (endpoint === "/api/ce/component") {
          if (callCount === 1) {
            return {
              current: { id: "task-1", status: "IN_PROGRESS" },
              queue: [],
            };
          }
          // Task finished, no longer current
          return { queue: [] };
        }
        // Task endpoint
        return {
          task: {
            id: "task-1",
            status: "SUCCESS",
            componentKey: "my-project",
            componentName: "My Project",
            type: "REPORT",
            submittedAt: "2026-01-24T10:00:00Z",
          },
        };
      });

      const result = await ce.waitForAnalysis("my-project", 5000, 50);

      expect(result?.status).toBe("SUCCESS");
    });

    test("returns undefined on timeout", async () => {
      (client.get as ReturnType<typeof mock>).mockResolvedValue({
        current: { id: "task-1", status: "IN_PROGRESS" },
        queue: [],
      });

      const result = await ce.waitForAnalysis("my-project", 100, 50);

      expect(result).toBeUndefined();
    });
  });

  describe("formatTaskStatus", () => {
    test("formats successful task", () => {
      const task = {
        id: "task-1",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "SUCCESS" as const,
        submittedAt: "2026-01-24T10:00:00Z",
        startedAt: "2026-01-24T10:00:01Z",
        executedAt: "2026-01-24T10:00:05Z",
        executionTimeMs: 4000,
      };

      const result = ce.formatTaskStatus(task);

      expect(result).toContain("SUCCESS");
      expect(result).toContain("My Project");
      expect(result).toContain("4.0s");
      expect(result).toContain("✅");
    });

    test("formats failed task with error", () => {
      const task = {
        id: "task-1",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "FAILED" as const,
        submittedAt: "2026-01-24T10:00:00Z",
        errorMessage: "Analysis failed due to missing files",
      };

      const result = ce.formatTaskStatus(task);

      expect(result).toContain("FAILED");
      expect(result).toContain("❌");
      expect(result).toContain("Analysis failed due to missing files");
    });

    test("formats pending task", () => {
      const task = {
        id: "task-1",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "PENDING" as const,
        submittedAt: "2026-01-24T10:00:00Z",
      };

      const result = ce.formatTaskStatus(task);

      expect(result).toContain("PENDING");
      expect(result).toContain("⏳");
    });

    test("formats in_progress task", () => {
      const task = {
        id: "task-1",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "IN_PROGRESS" as const,
        submittedAt: "2026-01-24T10:00:00Z",
        startedAt: "2026-01-24T10:00:01Z",
      };

      const result = ce.formatTaskStatus(task);

      expect(result).toContain("IN_PROGRESS");
      expect(result).toContain("🔄");
      expect(result).toContain("Started:");
    });

    test("formats canceled task", () => {
      const task = {
        id: "task-1",
        type: "REPORT",
        componentKey: "my-project",
        componentName: "My Project",
        status: "CANCELED" as const,
        submittedAt: "2026-01-24T10:00:00Z",
      };

      const result = ce.formatTaskStatus(task);

      expect(result).toContain("CANCELED");
      expect(result).toContain("🚫");
    });
  });
});
