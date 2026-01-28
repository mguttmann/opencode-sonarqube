/**
 * SonarQube Scanner Runner
 * Executes the sonar-scanner via npx
 */

import type { SonarQubeConfig, ScannerOptions, AnalysisResult, ProjectState } from "../types/index.ts";
import { createSonarQubeAPI } from "../api/index.ts";
import { writePropertiesFile } from "./config.ts";
import { formatIssuesForAgent } from "../utils/severity.ts";
import { Logger } from "../utils/logger.ts";

const logger = new Logger("scanner-runner");

/**
 * Scanner execution result
 */
interface ScannerResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  taskId?: string;
}

/**
 * Extract the CE task ID from scanner output
 * The scanner outputs lines like: "INFO: More about the report processing at http://host/api/ce/task?id=TASK_ID"
 */
function extractTaskId(output: string): string | undefined {
  // Look for task ID in the scanner output (UUID format with hyphens)
  const taskIdRegex = /api\/ce\/task\?id=([\w-]+)/;
  const taskIdMatch = taskIdRegex.exec(output);
  /* c8 ignore next 3 - only triggered with real scanner output */
  if (taskIdMatch) {
    return taskIdMatch[1];
  }
  // Alternative pattern: "task id: xxx" or "taskId: xxx" or "task=xxx"
  /* c8 ignore next 3 */
  const altRegex = /task\s*id(?::|=|\s)\s*([\w-]+)/i;
  const altMatch = altRegex.exec(output);
  return altMatch?.[1];
}

/**
 * Sanitize argument values - removes newlines only.
 * Since we use Bun.spawn with an array (no shell), there is no injection risk.
 * Only newlines are stripped as they could break the argument parsing.
 */
function sanitizeArgValue(value: string): string {
  return value.replaceAll(/[\n\r]/g, '');
}

/**
 * Run the SonarQube scanner
 */
export async function runScanner(
  config: SonarQubeConfig,
  state: ProjectState,
  options: ScannerOptions,
  directory?: string
): Promise<ScannerResult> {
  const dir = directory ?? process.cwd();

  logger.info(`Starting SonarQube analysis for ${options.projectKey}`);

  // Build scanner arguments using project token from state
  // Sanitize all user-provided values to prevent command injection
  const args: string[] = [
    `-Dsonar.host.url=${sanitizeArgValue(config.url)}`,
    `-Dsonar.token=${sanitizeArgValue(state.projectToken)}`,
    `-Dsonar.projectKey=${sanitizeArgValue(options.projectKey)}`,
  ];

  // Add optional parameters
  if (options.projectName) {
    args.push(`-Dsonar.projectName=${sanitizeArgValue(options.projectName)}`);
  }

  if (options.sources) {
    args.push(`-Dsonar.sources=${sanitizeArgValue(options.sources)}`);
  }

  if (options.tests) {
    args.push(`-Dsonar.tests=${sanitizeArgValue(options.tests)}`);
  }

  if (options.exclusions) {
    args.push(`-Dsonar.exclusions=${sanitizeArgValue(options.exclusions)}`);
  }

  // PR analysis parameters
  if (options.pullRequest) {
    args.push(
      `-Dsonar.pullrequest.key=${sanitizeArgValue(options.pullRequest.key)}`,
      `-Dsonar.pullrequest.branch=${sanitizeArgValue(options.pullRequest.branch)}`,
      `-Dsonar.pullrequest.base=${sanitizeArgValue(options.pullRequest.base)}`
    );
  } else if (options.branch) {
    args.push(`-Dsonar.branch.name=${sanitizeArgValue(options.branch)}`);
  }

  // Additional properties
  if (options.additionalProperties) {
    for (const [key, value] of Object.entries(options.additionalProperties)) {
      args.push(`-D${sanitizeArgValue(key)}=${sanitizeArgValue(value)}`);
    }
  }

  logger.debug("Scanner arguments", { args: args.map((a) => a.includes("token") ? "-Dsonar.token=***" : a) });

  try {
    // Execute scanner using npx
    const proc = Bun.spawn(["npx", "sonarqube-scanner", ...args], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        // Ensure Node has enough memory
        NODE_OPTIONS: `${process.env["NODE_OPTIONS"] ?? ""} --max-old-space-size=4096`.trim(),
      },
    });

    // Collect output
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    const output = stdout + (stderr ? `\n${stderr}` : "");

    const taskId = extractTaskId(output);
    
    if (exitCode === 0) {
      logger.info("Scanner completed successfully", { taskId });
      return { success: true, output, exitCode, taskId };
    }
    
    // Scanner may exit with code 1 if quality gate failed (sonar.qualitygate.wait=true)
    // but the analysis was still uploaded successfully - check for task ID
    if (taskId) {
      logger.warn(`Scanner exited with code ${exitCode} but analysis was uploaded`, { taskId });
      return { success: true, output, exitCode, taskId };
    }
    
    logger.error(`Scanner failed with exit code ${exitCode}`);
    return {
      success: false,
      output,
      error: `Scanner exited with code ${exitCode}`,
      exitCode,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Scanner execution failed: ${errorMessage}`);
    return {
      success: false,
      output: "",
      error: errorMessage,
      exitCode: 1,
    };
  }
}

/**
 * Run analysis and get results
 * This is the main entry point for running analysis
 */
export async function runAnalysis(
  config: SonarQubeConfig,
  state: ProjectState,
  options: Partial<ScannerOptions> & { projectKey: string },
  directory?: string
): Promise<AnalysisResult> {
  const dir = directory ?? process.cwd();
  const api = createSonarQubeAPI(config, state);

  const projectName = options.projectName ?? options.projectKey;

  // Check if sonar-project.properties already exists (e.g., from CI/CD setup)
  // If it exists, use it as-is to ensure CI/CD and local use the same config
  const propertiesPath = `${dir}/sonar-project.properties`;
  const propertiesExist = await Bun.file(propertiesPath).exists();
  
  if (propertiesExist) {
    logger.info("Using existing sonar-project.properties (CI/CD compatible)");
  } else {
    // Create sonar-project.properties only if it doesn't exist
    // Use explicit sources (detected or passed), NOT "." with sonar.inclusions
    await writePropertiesFile(
      {
        projectKey: options.projectKey,
        projectName,
        sources: options.sources ?? config.sources,  // Use passed/detected sources
        tests: options.tests ?? config.tests,
        exclusions: options.exclusions ?? config.exclusions,
      },
      config,
      dir
    );
    logger.info("Created sonar-project.properties");
  }

  // Run the scanner
  const scannerResult = await runScanner(
    config,
    state,
    {
      projectKey: options.projectKey,
      projectName,
      sources: options.sources,
      tests: options.tests,
      exclusions: options.exclusions,
      additionalProperties: options.additionalProperties,
      pullRequest: options.pullRequest,
      branch: options.branch,
    },
    dir
  );

  // Wait for SonarQube to process results using the task ID from scanner
  /* c8 ignore start - requires real scanner execution */
  if (scannerResult.success && scannerResult.taskId) {
    logger.info(`Waiting for analysis task ${scannerResult.taskId} to complete...`);
    try {
      const task = await api.ce.waitForTask(scannerResult.taskId);
      if (task) {
        logger.info(`Analysis task completed: ${task.status}`);
        if (task.status === "FAILED") {
          logger.error(`Analysis failed: ${task.errorMessage ?? "Unknown error"}`);
        }
      } else {
        logger.warn("Task not found - continuing with available results");
      }
    } catch (waitError) {
      logger.debug("Could not wait for task via CE API", { waitError });
    }
  } else if (scannerResult.success) {
    // Fallback: no task ID found, wait briefly
    logger.debug("No task ID in scanner output, waiting briefly...");
    await Bun.sleep(3000);
  }
  /* c8 ignore stop */

  // Fetch results from API
  try {
    const [qgStatus, issueCounts, formattedIssues] = await Promise.all([
      api.qualityGate.getStatus(options.projectKey),
      api.issues.getCounts(options.projectKey),
      api.issues.getFormattedIssues({ projectKey: options.projectKey }),
    ]);

    const qualityGateStatus = qgStatus.projectStatus.status;

    // Get metrics
    let metrics: AnalysisResult["metrics"] = {
      bugs: issueCounts.blocker + issueCounts.critical,
      vulnerabilities: 0,
      codeSmells: issueCounts.major + issueCounts.minor + issueCounts.info,
    };

    try {
      const fullMetrics = await api.qualityGate.getQualityMetrics(options.projectKey);
      metrics = {
        coverage: fullMetrics.coverage,
        duplications: fullMetrics.duplications,
        bugs: fullMetrics.bugs,
        vulnerabilities: fullMetrics.vulnerabilities,
        codeSmells: fullMetrics.codeSmells,
        securityHotspots: fullMetrics.securityHotspots,
      };
    } catch (metricsError) {
      // Metrics may not be available immediately after scan - this is expected
      logger.debug("Metrics not available yet, using issue counts only", { metricsError });
    }

    return {
      success: scannerResult.success,
      qualityGateStatus,
      issues: issueCounts,
      metrics,
      formattedIssues,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.warn("Could not fetch results from API, returning partial result", { error });
    return {
      success: scannerResult.success,
      qualityGateStatus: "NONE",
      issues: {
        total: 0,
        blocker: 0,
        critical: 0,
        major: 0,
        minor: 0,
        info: 0,
      },
      metrics: {},
      formattedIssues: [],
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Format analysis result for agent consumption
 */
export function formatAnalysisResult(result: AnalysisResult): string {
  return formatIssuesForAgent(result.formattedIssues, result.qualityGateStatus);
}
