/**
 * Rules handler for SonarQube tool
 */

import type { HandlerContext } from "../base-handler.ts";
import { ErrorMessages } from "../../utils/error-messages.ts";

/**
 * Handle rule action - explain a SonarQube rule
 */
export async function handleRule(
  ctx: HandlerContext,
  ruleKey?: string
): Promise<string> {
  if (!ruleKey) {
    return `## SonarQube Error\n\n${ErrorMessages.missingRuleKey()}`;
  }

  const { api } = ctx;
  const rule = await api.rules.getRule(ruleKey);

  if (!rule) {
    return `## SonarQube Rule Not Found\n\n${ErrorMessages.ruleNotFound(ruleKey)}`;
  }

  return `## SonarQube Rule: ${rule.name}

**Key:** \`${rule.key}\`
**Severity:** ${rule.severity}
**Type:** ${rule.type}
${rule.langName ? `**Language:** ${rule.langName}` : ""}
${rule.tags.length > 0 ? `**Tags:** ${rule.tags.join(", ")}` : ""}

### Description

${rule.description}

### How to Fix

Based on this rule, you should:
1. Review the flagged code section
2. Apply the recommended coding practice
3. Re-run analysis to verify the fix`;
}
