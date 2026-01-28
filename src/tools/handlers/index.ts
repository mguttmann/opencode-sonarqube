/**
 * Handler exports for SonarQube tool
 */

// Re-export HandlerContext for use in sonarqube.ts
export type { HandlerContext } from "../base-handler.ts";
export { createHandlerContext } from "../base-handler.ts";

export { handleSetup } from "./setup.ts";
export { handleAnalyze } from "./analyze.ts";
export { handleIssues, handleNewIssues, handleWorstFiles } from "./issues.ts";
export { handleStatus, handleValidate } from "./status.ts";
export { handleHotspots, handleReviewHotspot } from "./security.ts";
export { handleDuplications } from "./duplications.ts";
export { handleRule } from "./rules.ts";
export { handleHistory, handleProfile, handleBranches } from "./history.ts";
export { handleMetrics } from "./metrics.ts";
