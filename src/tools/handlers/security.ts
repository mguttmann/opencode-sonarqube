/**
 * Security handlers for SonarQube tool
 */

import type { HandlerContext } from "../base-handler.ts";
import { formatEmptyState, formatSuccess } from "../formatters.ts";
import { createSonarQubeAPIWithCredentials, type SonarQubeAPI } from "../../api/index.ts";

/**
 * Error message shown when admin credentials are missing or invalid for hotspot review.
 * Hotspot review requires elevated permissions that project tokens don't have.
 */
const HOTSPOT_AUTH_ERROR = `**Hotspot review requires admin credentials.**

Project tokens don't have permission to review security hotspots.
The plugin needs valid admin credentials configured in one of these locations:

**Option 1: Environment variables** (recommended)
\`\`\`
export SONAR_HOST_URL=https://your-sonarqube-server.com
export SONAR_USER=admin
export SONAR_PASSWORD=your-password
\`\`\`

**Option 2: .sonarqube/config.json** (in your project root)
\`\`\`json
{
  "url": "https://your-sonarqube-server.com",
  "user": "admin",
  "password": "your-password"
}
\`\`\`

The user needs the **"Administer Security Hotspot"** permission in SonarQube.`;

/**
 * Create an API client with admin credentials for operations that require elevated permissions.
 * Project tokens typically lack hotspot review permissions (403), so we fall back to admin credentials.
 */
function createAdminAPI(ctx: HandlerContext): SonarQubeAPI {
  return createSonarQubeAPIWithCredentials(ctx.config.url, ctx.config.user, ctx.config.password);
}

/**
 * Check if an error is an authentication/permission error (401 or 403).
 */
function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("insufficient permissions") ||
    msg.includes("invalid credentials") ||
    msg.includes("401") ||
    msg.includes("403");
}

/**
 * Handle hotspots action - get security hotspots for review
 */
export async function handleHotspots(ctx: HandlerContext): Promise<string> {
  const { api, projectKey } = ctx;

  const hotspots = await api.issues.getSecurityHotspots(projectKey);

  if (hotspots.length === 0) {
    return formatSuccess("Security Hotspots", formatEmptyState("security hotspots", projectKey, "Your code has no security concerns requiring manual review."));
  }

  const toReview = hotspots.filter((h) => h.status === "TO_REVIEW");
  const reviewed = hotspots.filter((h) => h.status !== "TO_REVIEW");

  let output = `## Security Hotspots

**Project:** \`${projectKey}\`
**Total Hotspots:** ${hotspots.length}
**Pending Review:** ${toReview.length}
**Already Reviewed:** ${reviewed.length}

`;

  if (toReview.length > 0) {
    output += "### Hotspots Requiring Review\n\n";
    output += "| # | Risk | Key | File | Line | Issue |\n";
    output += "|---|------|-----|------|------|-------|\n";

    for (let i = 0; i < Math.min(toReview.length, 50); i++) {
      const hotspot = toReview[i];
      const risk = hotspot.vulnerabilityProbability;
      const file = hotspot.component.split(":").pop() ?? hotspot.component;
      const line = hotspot.line ?? "?";
      const msg = hotspot.message.length > 50
        ? hotspot.message.substring(0, 47) + "..."
        : hotspot.message;
      output += `| ${i + 1} | ${risk} | \`${hotspot.key.substring(0, 8)}\` | ${file} | ${line} | ${msg} |\n`;
    }

    if (toReview.length > 50) {
      output += `\n*... and ${toReview.length - 50} more hotspots*\n`;
    }

    output += `\n### How to Review Hotspots

You can review hotspots directly using this tool:

**Review a single hotspot:**
\`\`\`
sonarqube({ action: "reviewhotspot", hotspotKey: "<key>", resolution: "SAFE", comment: "Reviewed: no security risk because..." })
\`\`\`

**Review ALL pending hotspots as SAFE:**
\`\`\`
sonarqube({ action: "reviewhotspot", resolution: "SAFE", comment: "Bulk review: all hotspots verified safe" })
\`\`\`

**Resolutions:**
- \`SAFE\` — The code is secure despite the warning (most common)
- \`FIXED\` — The vulnerability has been remediated
- \`ACKNOWLEDGED\` — Known risk, accepted

### Review Guidelines

1. **HIGH risk**: Review the code carefully — potential security vulnerability
2. **MEDIUM risk**: Check regex patterns, randomness, protocol usage
3. **LOW risk**: Usually informational — hardcoded IPs, HTTP URLs in non-production code
`;
  }

  return output;
}

type HotspotResolution = "SAFE" | "FIXED" | "ACKNOWLEDGED";

/**
 * Validate and authenticate admin API for hotspot review.
 * Returns the admin API or an error message string.
 */
async function getAuthenticatedAdminAPI(ctx: HandlerContext): Promise<SonarQubeAPI | string> {
  try {
    const adminApi = createAdminAPI(ctx);
    await adminApi.client.validateAuth();
    return adminApi;
  } catch (error) {
    if (isAuthError(error)) {
      return HOTSPOT_AUTH_ERROR;
    }
    const msg = error instanceof Error ? error.message : String(error);
    return `**Error connecting to SonarQube:** ${msg}\n\n${HOTSPOT_AUTH_ERROR}`;
  }
}

/**
 * Bulk review all TO_REVIEW hotspots for a project.
 */
async function bulkReviewAllHotspots(
  api: SonarQubeAPI,
  adminApi: SonarQubeAPI,
  projectKey: string,
  res: HotspotResolution,
  comment?: string
): Promise<string> {
  const toReview = await api.issues.getSecurityHotspotsToReview(projectKey);

  if (toReview.length === 0) {
    return formatSuccess("Review Hotspots", "No pending hotspots to review. All hotspots have already been reviewed.");
  }

  const result = await adminApi.issues.bulkReviewHotspots(
    toReview.map((h) => h.key),
    res,
    comment ?? `Bulk reviewed as ${res} via opencode-sonarqube plugin`
  );

  if (result.failed > 0 && result.success === 0 && result.errors.some((e) => e.includes("Insufficient permissions"))) {
    return HOTSPOT_AUTH_ERROR;
  }

  return formatBulkReviewResult(projectKey, res, result);
}

/**
 * Format the bulk review result into a markdown string.
 */
function formatBulkReviewResult(
  projectKey: string,
  res: HotspotResolution,
  result: { success: number; failed: number; errors: string[] }
): string {
  const lines = [
    "## Hotspot Bulk Review Complete",
    "",
    `**Project:** \`${projectKey}\``,
    `**Resolution:** ${res}`,
    `**Reviewed:** ${result.success} hotspots`,
    `**Failed:** ${result.failed} hotspots`,
  ];

  if (result.errors.length > 0) {
    lines.push("", "### Errors");
    for (const err of result.errors.slice(0, 10)) {
      lines.push(`- ${err}`);
    }
  }

  lines.push("", "> Run `sonarqube({ action: \"status\" })` to check the updated Quality Gate.");
  return lines.join("\n");
}

/**
 * Review a single hotspot by key.
 */
async function reviewSingleHotspot(
  adminApi: SonarQubeAPI,
  hotspotKey: string,
  res: HotspotResolution,
  comment?: string
): Promise<string> {
  try {
    await adminApi.issues.reviewHotspot(
      hotspotKey,
      "REVIEWED",
      res,
      comment ?? `Reviewed as ${res} via opencode-sonarqube plugin`
    );

    const lines = [
      "## Hotspot Reviewed",
      "",
      `**Hotspot:** \`${hotspotKey}\``,
      "**Status:** REVIEWED",
      `**Resolution:** ${res}`,
    ];
    if (comment) {
      lines.push(`**Comment:** ${comment}`);
    }
    lines.push("", "> Run `sonarqube({ action: \"hotspots\" })` to see remaining hotspots.");
    return lines.join("\n");
  } catch (error) {
    if (isAuthError(error)) {
      return HOTSPOT_AUTH_ERROR;
    }
    const msg = error instanceof Error ? error.message : String(error);
    return `**Error reviewing hotspot:** ${msg}\n\nMake sure the hotspot key is correct. Use \`sonarqube({ action: "hotspots" })\` to list hotspot keys.`;
  }
}

/**
 * Handle reviewhotspot action — review (resolve) security hotspots via the API
 */
export async function handleReviewHotspot(
  ctx: HandlerContext,
  hotspotKey?: string,
  resolution?: string,
  comment?: string
): Promise<string> {
  const validResolutions = ["SAFE", "FIXED", "ACKNOWLEDGED"];
  const res = (resolution?.toUpperCase() ?? "SAFE") as HotspotResolution;

  if (!validResolutions.includes(res)) {
    return `**Error:** Invalid resolution "${resolution}". Must be one of: SAFE, FIXED, ACKNOWLEDGED`;
  }

  const adminApiOrError = await getAuthenticatedAdminAPI(ctx);
  if (typeof adminApiOrError === "string") {
    return adminApiOrError;
  }

  if (!hotspotKey) {
    return bulkReviewAllHotspots(ctx.api, adminApiOrError, ctx.projectKey, res, comment);
  }

  return reviewSingleHotspot(adminApiOrError, hotspotKey, res, comment);
}
