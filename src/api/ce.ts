/**
 * SonarQube Compute Engine (CE) API
 * Handles analysis task status and polling
 */

import type { SonarQubeClient } from "./client.ts";
import { Logger } from "../utils/logger.ts";
import { BaseAPI } from "./base-api.ts";
import { API } from "../constants.ts";
import type { AnalysisTask, TaskStatus, PagingResponse } from "./types.ts";

// Re-export types for backwards compatibility
export type { AnalysisTask, TaskStatus } from "./types.ts";

// Debug logging for CE API - disabled in production
const debugLog = (_msg: string) => {
  // Enable for debugging: appendFileSync("/tmp/sonarqube-plugin-debug.log", `${new Date().toISOString()} [ce] ${msg}\n`);
};

/**
 * CE task response
 */
interface TaskResponse {
  task: AnalysisTask;
}

/**
 * CE activity response
 */
interface ActivityResponse {
  tasks: AnalysisTask[];
  paging: PagingResponse;
}

/**
 * Component queue response
 */
interface ComponentResponse {
  queue: AnalysisTask[];
  current?: AnalysisTask;
}

export class ComputeEngineAPI extends BaseAPI {
  constructor(client: SonarQubeClient, logger?: Logger) {
    super(client, "sonarqube-ce", logger);
  }

  /**
   * Get status of a specific task
   */
  async getTask(taskId: string): Promise<AnalysisTask | undefined> {
    this.logger.debug(`Getting task status: ${taskId}`);

    try {
      const response = await this.client.get<TaskResponse>("/api/ce/task", {
        id: taskId,
      });
      return response.task;
    } catch (error) {
      this.logger.warn(`Failed to get task ${taskId}: ${error}`);
      return undefined;
    }
  }

  /**
   * Get current and queued tasks for a component
   */
  async getComponentTasks(componentKey: string): Promise<{
    current?: AnalysisTask;
    queue: AnalysisTask[];
  }> {
    this.logger.debug(`Getting tasks for component: ${componentKey}`);

    try {
      const response = await this.client.get<ComponentResponse>("/api/ce/component", {
        component: componentKey,
      });
      return {
        current: response.current,
        queue: response.queue,
      };
    } catch (error) {
      this.logger.warn(`Failed to get component tasks: ${error}`);
      return { queue: [] };
    }
  }

  /**
   * Get recent activity for a component
   */
  async getActivity(options: {
    componentKey?: string;
    status?: TaskStatus;
    onlyCurrents?: boolean;
    maxExecutedAt?: string;
    minSubmittedAt?: string;
    pageSize?: number;
  }): Promise<AnalysisTask[]> {
    this.logger.debug(`Getting CE activity`, options);

    try {
      const response = await this.client.get<ActivityResponse>("/api/ce/activity", {
        component: options.componentKey,
        status: options.status,
        onlyCurrents: options.onlyCurrents?.toString(),
        maxExecutedAt: options.maxExecutedAt,
        minSubmittedAt: options.minSubmittedAt,
        ps: options.pageSize ?? API.DEFAULT_LIMIT,
      });
      return response.tasks;
    } catch (error) {
      this.logger.warn(`Failed to get activity: ${error}`);
      return [];
    }
  }

  /**
   * Get the latest task for a component
   */
  async getLatestTask(componentKey: string): Promise<AnalysisTask | undefined> {
    const tasks = await this.getActivity({
      componentKey,
      pageSize: 1,
    });
    return tasks[0];
  }

  /**
   * Check if there's an analysis in progress for a component
   */
  async isAnalysisInProgress(componentKey: string): Promise<boolean> {
    const { current, queue } = await this.getComponentTasks(componentKey);
    return current !== undefined || queue.length > 0;
  }

  /**
   * Check if we should continue polling
   */
  private shouldContinuePolling(startTime: number, maxWaitMs: number): boolean {
    return Date.now() - startTime < maxWaitMs;
  }

  /**
   * Check if task is in a terminal state
   */
  private isTaskComplete(status: string): boolean {
    return ["SUCCESS", "FAILED", "CANCELED"].includes(status);
  }

  /**
   * Handle task not found scenario
   */
  private handleTaskNotFound(
    taskId: string,
    retries: number,
    maxRetries: number
  ): { shouldContinue: boolean; newRetries: number } {
    if (retries >= maxRetries) {
      this.logger.warn(`Failed to get task ${taskId}: Not found after ${maxRetries} retries`);
      return { shouldContinue: false, newRetries: retries };
    }
    return { shouldContinue: true, newRetries: retries + 1 };
  }

  /**
   * Wait for a specific task to complete by task ID
   * @param taskId The CE task ID from scanner output
   * @param pollIntervalMs Time between polls (default 2 seconds)
   * @param maxWaitMs Maximum time to wait (default 5 minutes)
   * @returns The completed task or undefined if timeout/not found
   */
  async waitForTask(
    taskId: string,
    pollIntervalMs: number = API.POLL_INTERVAL_MS,
    maxWaitMs: number = API.ANALYSIS_TIMEOUT_MS
  ): Promise<AnalysisTask | undefined> {
    this.logger.info(`Waiting for task to complete: ${taskId}`);

    const startTime = Date.now();
    let taskNotFoundRetries = 0;
    const maxTaskNotFoundRetries = 10;

    debugLog(`waitForTask: starting for ${taskId}`);

    while (this.shouldContinuePolling(startTime, maxWaitMs)) {
      const task = await this.getTask(taskId);

      if (!task) {
        const result = this.handleTaskNotFound(taskId, taskNotFoundRetries, maxTaskNotFoundRetries);
        taskNotFoundRetries = result.newRetries;

        if (!result.shouldContinue) {
          debugLog(`waitForTask: giving up after ${maxTaskNotFoundRetries} retries`);
          return undefined;
        }

        debugLog(`waitForTask: task not found, retry ${taskNotFoundRetries}/${maxTaskNotFoundRetries}`);
        this.logger.debug(`Task ${taskId} not found yet, retrying (${taskNotFoundRetries}/${maxTaskNotFoundRetries})...`);
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      taskNotFoundRetries = 0;
      debugLog(`waitForTask: task found, status=${task.status}`);

      if (this.isTaskComplete(task.status)) {
        this.logger.info(`Task completed with status: ${task.status}`);
        debugLog(`waitForTask: task completed with ${task.status}`);
        return task;
      }

      this.logger.debug(`Task in progress: ${task.status}`);
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    this.logger.warn(`Timeout waiting for task ${taskId}`);
    debugLog(`waitForTask: timeout after ${maxWaitMs}ms`);
    return undefined;
  }

  /**
   * Wait for analysis to complete (legacy method - use waitForTask when task ID is available)
   * @param componentKey The component key
   * @param timeoutMs Maximum time to wait (default 5 minutes)
   * @param pollIntervalMs Time between polls (default 2 seconds)
   * @returns The completed task or undefined if timeout
   */
  async waitForAnalysis(
    componentKey: string,
    timeoutMs: number = API.ANALYSIS_TIMEOUT_MS,
    pollIntervalMs: number = API.POLL_INTERVAL_MS
  ): Promise<AnalysisTask | undefined> {
    this.logger.info(`Waiting for analysis to complete: ${componentKey}`);

    const startTime = Date.now();
    let lastTaskId: string | undefined;

    while (Date.now() - startTime < timeoutMs) {
      const { current, queue } = await this.getComponentTasks(componentKey);

      // If there's a current task, track it
      if (current) {
        lastTaskId = current.id;

        if (current.status === "SUCCESS" || current.status === "FAILED" || current.status === "CANCELED") {
          this.logger.info(`Analysis completed with status: ${current.status}`);
          return current;
        }

        this.logger.debug(`Analysis in progress: ${current.status}`);
      } else if (queue.length === 0 && lastTaskId) {
        // Task completed, fetch the final status
        const task = await this.getTask(lastTaskId);
        if (task) {
          this.logger.info(`Analysis completed with status: ${task.status}`);
          return task;
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    this.logger.warn(`Analysis wait timeout after ${timeoutMs}ms`);
    return undefined;
  }

  /**
   * Format task status for display
   */
  formatTaskStatus(task: AnalysisTask): string {
    const lines: string[] = [];

    const statusEmoji = {
      PENDING: "⏳",
      IN_PROGRESS: "🔄",
      SUCCESS: "✅",
      FAILED: "❌",
      CANCELED: "🚫",
    }[task.status] ?? "❓";

    lines.push(
      `### Analysis Task ${statusEmoji}`,
      `**Status:** ${task.status}`,
      `**Component:** ${task.componentName}`,
      `**Submitted:** ${task.submittedAt}`
    );

    if (task.startedAt) {
      lines.push(`**Started:** ${task.startedAt}`);
    }

    if (task.executedAt) {
      lines.push(`**Completed:** ${task.executedAt}`);
    }

    if (task.executionTimeMs) {
      const seconds = (task.executionTimeMs / 1000).toFixed(1);
      lines.push(`**Duration:** ${seconds}s`);
    }

    if (task.errorMessage) {
      lines.push(`**Error:** ${task.errorMessage}`);
    }

    return lines.join("\n");
  }
}
